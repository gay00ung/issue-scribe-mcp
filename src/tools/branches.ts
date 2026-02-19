import { z } from "zod";

import { getOctokit } from "../lib/octokit.js";
import { collectPaginated, PaginationSchema, resolvePagination } from "../lib/pagination.js";
import { executeTool } from "../lib/response.js";
import { assertConfirmation, assertExpectedValue } from "../lib/safety.js";
import type { ToolRegistration } from "./types.js";

const ListBranchesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    protected: z.boolean().optional(),
}).merge(PaginationSchema);

const CreateBranchSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    ref: z.string(),
});

const DeleteBranchSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    dry_run: z.boolean().optional(),
    confirm_token: z.string().optional(),
    expected_sha: z.string().optional(),
});

const CompareBranchesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    base: z.string(),
    head: z.string(),
    max_commits: z.number().int().min(1).max(500).optional(),
    max_files: z.number().int().min(1).max(500).optional(),
});

export const branchTools: ToolRegistration[] = [
    {
        definition: {
            name: "github_list_branches",
            description: "List repository branches with pagination",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    protected: { type: "boolean", description: "Filter by protected status (optional)" },
                    page: { type: "number", description: "Page number (optional, default: 1)" },
                    per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    fetch_all: { type: "boolean", description: "Fetch all pages (optional, default: false)" },
                },
                required: ["owner", "repo"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            ListBranchesSchema,
            "Failed to list branches",
            async (args) => {
                const pagination = resolvePagination(args, {
                    page: 1,
                    perPage: 30,
                    fetchAll: false,
                });

                const branches = await collectPaginated(pagination, async (page, perPage) => {
                    const response = await getOctokit().rest.repos.listBranches({
                        owner: args.owner,
                        repo: args.repo,
                        protected: args.protected,
                        page,
                        per_page: perPage,
                    });
                    return response.data;
                });

                return {
                    success: true,
                    count: branches.items.length,
                    branches: branches.items.map((branch) => ({
                        name: branch.name,
                        commit: {
                            sha: branch.commit.sha,
                            url: branch.commit.url,
                        },
                        protected: branch.protected,
                    })),
                    pagination: {
                        page: branches.page,
                        per_page: branches.per_page,
                        fetch_all: branches.fetch_all,
                        pages_fetched: branches.pages_fetched,
                    },
                };
            }
        ),
    },
    {
        definition: {
            name: "github_create_branch",
            description: "Create a new branch from an existing branch or commit SHA",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    branch: { type: "string", description: "New branch name" },
                    ref: { type: "string", description: "Source branch name or commit SHA" },
                },
                required: ["owner", "repo", "branch", "ref"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            CreateBranchSchema,
            "Failed to create branch",
            async (args) => {
                let sha: string;

                try {
                    const branchRef = await getOctokit().rest.git.getRef({
                        owner: args.owner,
                        repo: args.repo,
                        ref: `heads/${args.ref}`,
                    });
                    sha = branchRef.data.object.sha;
                } catch {
                    const commit = await getOctokit().rest.git.getCommit({
                        owner: args.owner,
                        repo: args.repo,
                        commit_sha: args.ref,
                    });
                    sha = commit.data.sha;
                }

                const newBranch = await getOctokit().rest.git.createRef({
                    owner: args.owner,
                    repo: args.repo,
                    ref: `refs/heads/${args.branch}`,
                    sha,
                });

                return {
                    success: true,
                    branch: {
                        name: args.branch,
                        ref: newBranch.data.ref,
                        sha: newBranch.data.object.sha,
                        url: newBranch.data.url,
                    },
                    message: `Branch \"${args.branch}\" created successfully from \"${args.ref}\"`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_delete_branch",
            description: "Delete a branch with dry-run, expected SHA check, and confirmation safeguards",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    branch: { type: "string", description: "Branch name to delete" },
                    dry_run: { type: "boolean", description: "Preview deletion without executing (optional, default: false)" },
                    expected_sha: { type: "string", description: "Optional guard: branch HEAD SHA must match this value" },
                    confirm_token: { type: "string", description: "Must be \"CONFIRM\" to execute delete when dry_run=false" },
                },
                required: ["owner", "repo", "branch"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            DeleteBranchSchema,
            "Failed to delete branch",
            async (args) => {
                const refData = await getOctokit().rest.git.getRef({
                    owner: args.owner,
                    repo: args.repo,
                    ref: `heads/${args.branch}`,
                });
                const currentSha = refData.data.object.sha;

                assertExpectedValue(args.expected_sha, currentSha, "branch head sha");

                if (args.dry_run ?? false) {
                    return {
                        success: true,
                        dry_run: true,
                        action: "delete_branch",
                        target: {
                            branch: args.branch,
                            current_sha: currentSha,
                        },
                        message: "Dry run only. No deletion executed.",
                    };
                }

                assertConfirmation(args.confirm_token, "Branch deletion");

                await getOctokit().rest.git.deleteRef({
                    owner: args.owner,
                    repo: args.repo,
                    ref: `heads/${args.branch}`,
                });

                return {
                    success: true,
                    dry_run: false,
                    message: `Branch \"${args.branch}\" deleted successfully from ${args.owner}/${args.repo}`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_compare_branches",
            description: "Compare two branches and return commit/file differences",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    base: { type: "string", description: "Base branch" },
                    head: { type: "string", description: "Head branch to compare" },
                    max_commits: { type: "number", description: "Max commits to include in response (optional, default: 250)" },
                    max_files: { type: "number", description: "Max files to include in response (optional, default: 250)" },
                },
                required: ["owner", "repo", "base", "head"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            CompareBranchesSchema,
            "Failed to compare branches",
            async (args) => {
                const comparison = await getOctokit().rest.repos.compareCommits({
                    owner: args.owner,
                    repo: args.repo,
                    base: args.base,
                    head: args.head,
                });

                const maxCommits = args.max_commits ?? 250;
                const maxFiles = args.max_files ?? 250;
                const commits = comparison.data.commits.slice(0, maxCommits);
                const files = (comparison.data.files ?? []).slice(0, maxFiles);

                return {
                    success: true,
                    comparison: {
                        status: comparison.data.status,
                        ahead_by: comparison.data.ahead_by,
                        behind_by: comparison.data.behind_by,
                        total_commits: comparison.data.total_commits,
                        base_commit: {
                            sha: comparison.data.base_commit.sha,
                            message: comparison.data.base_commit.commit.message,
                        },
                        commits: commits.map((commit) => ({
                            sha: commit.sha,
                            message: commit.commit.message,
                            author: commit.commit.author?.name,
                            date: commit.commit.author?.date,
                        })),
                        files: files.map((file) => ({
                            filename: file.filename,
                            status: file.status,
                            additions: file.additions,
                            deletions: file.deletions,
                            changes: file.changes,
                        })),
                        truncated: {
                            commits: comparison.data.commits.length > maxCommits,
                            files: (comparison.data.files?.length ?? 0) > maxFiles,
                        },
                    },
                    message: `Comparing ${args.base}...${args.head}: ${comparison.data.ahead_by} commits ahead, ${comparison.data.behind_by} commits behind`,
                };
            }
        ),
    },
];
