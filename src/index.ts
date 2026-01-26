#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Reaction type mapping: user-friendly names to GitHub API format
const REACTION_MAP: Record<string, string> = {
    "thumbs_up": "+1",
    "thumbs_down": "-1",
    "laugh": "laugh",
    "confused": "confused",
    "heart": "heart",
    "hooray": "hooray",
    "rocket": "rocket",
    "eyes": "eyes",
};

if (!GITHUB_TOKEN) {
    console.error("Error: GITHUB_TOKEN environment variable is required");
    process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const GetIssueSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
});

const GetPRSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
});

const CreateIssueSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
});

const UpdateIssueSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
    title: z.string().optional(),
    body: z.string().optional(),
    state: z.enum(["open", "closed"]).optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
});

const CreatePRSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    head: z.string(), // branch to merge FROM (e.g., "feature-branch")
    base: z.string(), // branch to merge INTO (e.g., "main")
    draft: z.boolean().optional(),
    maintainer_can_modify: z.boolean().optional(),
});

const AddCommentSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(), // works for both issues and PRs
    body: z.string(),
});

const UpdateCommentSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    comment_id: z.number(),
    body: z.string(),
});

const DeleteCommentSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    comment_id: z.number(),
});

const AddReactionSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    comment_id: z.number().optional(),
    issue_number: z.number().optional(),
    reaction: z.enum(["thumbs_up", "thumbs_down", "laugh", "confused", "heart", "hooray", "rocket", "eyes"]),
}).refine(data => data.comment_id || data.issue_number, {
    message: "Either comment_id or issue_number must be provided",
});

const SearchIssuesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    query: z.string().optional(),
    state: z.enum(["open", "closed", "all"]).optional(),
    labels: z.array(z.string()).optional(),
    sort: z.enum(["created", "updated", "comments"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    per_page: z.number().max(100).optional(),
});

const SearchPRsSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    query: z.string().optional(),
    state: z.enum(["open", "closed", "all"]).optional(),
    sort: z.enum(["created", "updated", "popularity", "long-running"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    per_page: z.number().max(100).optional(),
});

const ListRecentIssuesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).optional(),
    sort: z.enum(["created", "updated"]).optional(),
    per_page: z.number().max(100).optional(),
});

const MergePRSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
    merge_method: z.enum(["merge", "squash", "rebase"]).optional(),
    commit_title: z.string().optional(),
    commit_message: z.string().optional(),
});

const GetPRDiffSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
});

const GetPRFilesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
});

const CreateLabelSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    name: z.string(),
    color: z.string(), // hex color without '#'
    description: z.string().optional(),
});

const UpdateLabelSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    name: z.string(), // current label name
    new_name: z.string().optional(),
    color: z.string().optional(), // hex color without '#'
    description: z.string().optional(),
});

const DeleteLabelSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    name: z.string(),
});

const ListLabelsSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    per_page: z.number().max(100).optional(),
});

const ListBranchesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    protected: z.boolean().optional(),
    per_page: z.number().max(100).optional(),
});

const CreateBranchSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(), // new branch name
    ref: z.string(), // source branch or commit SHA (e.g., "main" or full ref "refs/heads/main")
});

const DeleteBranchSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(), // branch name to delete
});

const CompareBranchesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    base: z.string(), // base branch
    head: z.string(), // head branch to compare
});

const server = new Server(
    {
        name: "issue-scribe-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "github_get_issue_context",
                description: "Get GitHub Issue context including title, body, comments, and metadata",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        issue_number: { type: "number", description: "Issue number" },
                    },
                    required: ["owner", "repo", "issue_number"],
                },
            },
            {
                name: "github_get_pr_context",
                description: "Get GitHub Pull Request context including title, body, comments, commits, and metadata",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        pull_number: { type: "number", description: "Pull request number" },
                    },
                    required: ["owner", "repo", "pull_number"],
                },
            },
            {
                name: "github_create_issue",
                description: "Create a new GitHub Issue",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        title: { type: "string", description: "Issue title" },
                        body: { type: "string", description: "Issue body (optional)" },
                        labels: { type: "array", items: { type: "string" }, description: "Labels to add (optional)" },
                        assignees: { type: "array", items: { type: "string" }, description: "Assignees (optional)" },
                    },
                    required: ["owner", "repo", "title"],
                },
            },
            {
                name: "github_update_issue",
                description: "Update an existing GitHub Issue",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        issue_number: { type: "number", description: "Issue number" },
                        title: { type: "string", description: "New title (optional)" },
                        body: { type: "string", description: "New body (optional)" },
                        state: { type: "string", enum: ["open", "closed"], description: "Issue state (optional)" },
                        labels: { type: "array", items: { type: "string" }, description: "New labels (optional)" },
                        assignees: { type: "array", items: { type: "string" }, description: "New assignees (optional)" },
                    },
                    required: ["owner", "repo", "issue_number"],
                },
            },
            {
                name: "github_create_pr",
                description: "Create a new GitHub Pull Request",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        title: { type: "string", description: "PR title" },
                        body: { type: "string", description: "PR body/description (optional)" },
                        head: { type: "string", description: "Branch to merge FROM (e.g., 'feature-branch')" },
                        base: { type: "string", description: "Branch to merge INTO (e.g., 'main')" },
                        draft: { type: "boolean", description: "Create as draft PR (optional)" },
                        maintainer_can_modify: { type: "boolean", description: "Allow maintainer edits (optional)" },
                    },
                    required: ["owner", "repo", "title", "head", "base"],
                },
            },
            {
                name: "github_add_comment",
                description: "Add a comment to a GitHub Issue or Pull Request",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        issue_number: { type: "number", description: "Issue or PR number" },
                        body: { type: "string", description: "Comment body text" },
                    },
                    required: ["owner", "repo", "issue_number", "body"],
                },
            },
            {
                name: "github_update_comment",
                description: "Update an existing comment on a GitHub Issue or Pull Request",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        comment_id: { type: "number", description: "Comment ID to update" },
                        body: { type: "string", description: "New comment body text" },
                    },
                    required: ["owner", "repo", "comment_id", "body"],
                },
            },
            {
                name: "github_delete_comment",
                description: "Delete a comment from a GitHub Issue or Pull Request",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        comment_id: { type: "number", description: "Comment ID to delete" },
                    },
                    required: ["owner", "repo", "comment_id"],
                },
            },
            {
                name: "github_add_reaction",
                description: "Add a reaction (emoji) to a comment or an issue/PR directly. Provide either comment_id OR issue_number.",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        comment_id: { type: "number", description: "Comment ID to react to (optional if issue_number is provided)" },
                        issue_number: { type: "number", description: "Issue/PR number to react to (optional if comment_id is provided)" },
                        reaction: {
                            type: "string",
                            enum: ["thumbs_up", "thumbs_down", "laugh", "confused", "heart", "hooray", "rocket", "eyes"],
                            description: "Reaction type: thumbs_up 👍, thumbs_down 👎, laugh 😄, confused 😕, heart ❤️, hooray 🎉, rocket 🚀, eyes 👀"
                        },
                    },
                    required: ["owner", "repo", "reaction"],
                },
            },
            {
                name: "github_search_issues",
                description: "Search for issues in a repository with advanced filters",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        query: { type: "string", description: "Search query (optional)" },
                        state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state (optional)" },
                        labels: { type: "array", items: { type: "string" }, description: "Filter by labels (optional)" },
                        sort: { type: "string", enum: ["created", "updated", "comments"], description: "Sort by (optional)" },
                        direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction (optional)" },
                        per_page: { type: "number", description: "Results per page, max 100 (optional)" },
                    },
                    required: ["owner", "repo"],
                },
            },
            {
                name: "github_search_prs",
                description: "Search for pull requests in a repository with advanced filters",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        query: { type: "string", description: "Search query (optional)" },
                        state: { type: "string", enum: ["open", "closed", "all"], description: "PR state (optional)" },
                        sort: { type: "string", enum: ["created", "updated", "popularity", "long-running"], description: "Sort by (optional)" },
                        direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction (optional)" },
                        per_page: { type: "number", description: "Results per page, max 100 (optional)" },
                    },
                    required: ["owner", "repo"],
                },
            },
            {
                name: "github_list_recent_issues",
                description: "List recent issues in a repository",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state (optional, default: open)" },
                        sort: { type: "string", enum: ["created", "updated"], description: "Sort by (optional, default: created)" },
                        per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    },
                    required: ["owner", "repo"],
                },
            },
            {
                name: "github_merge_pr",
                description: "Merge a pull request",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        pull_number: { type: "number", description: "PR number to merge" },
                        merge_method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method (optional, default: merge)" },
                        commit_title: { type: "string", description: "Custom commit title (optional)" },
                        commit_message: { type: "string", description: "Custom commit message (optional)" },
                    },
                    required: ["owner", "repo", "pull_number"],
                },
            },
            {
                name: "github_get_pr_diff",
                description: "Get the full diff of a pull request",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        pull_number: { type: "number", description: "PR number" },
                    },
                    required: ["owner", "repo", "pull_number"],
                },
            },
            {
                name: "github_get_pr_files",
                description: "Get list of files changed in a pull request with details",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        pull_number: { type: "number", description: "PR number" },
                    },
                    required: ["owner", "repo", "pull_number"],
                },
            },
            {
                name: "github_create_label",
                description: "Create a new label in the repository",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        name: { type: "string", description: "Label name" },
                        color: { type: "string", description: "Hex color code without '#' (e.g., 'FF0000' for red)" },
                        description: { type: "string", description: "Label description (optional)" },
                    },
                    required: ["owner", "repo", "name", "color"],
                },
            },
            {
                name: "github_update_label",
                description: "Update an existing label (name, color, or description)",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        name: { type: "string", description: "Current label name to update" },
                        new_name: { type: "string", description: "New label name (optional)" },
                        color: { type: "string", description: "New hex color code without '#' (optional)" },
                        description: { type: "string", description: "New description (optional)" },
                    },
                    required: ["owner", "repo", "name"],
                },
            },
            {
                name: "github_delete_label",
                description: "Delete a label from the repository",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        name: { type: "string", description: "Label name to delete" },
                    },
                    required: ["owner", "repo", "name"],
                },
            },
            {
                name: "github_list_labels",
                description: "List all labels in the repository",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    },
                    required: ["owner", "repo"],
                },
            },
            {
                name: "github_list_branches",
                description: "List all branches in the repository",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        protected: { type: "boolean", description: "Filter by protected status (optional)" },
                        per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    },
                    required: ["owner", "repo"],
                },
            },
            {
                name: "github_create_branch",
                description: "Create a new branch from an existing branch or commit",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        branch: { type: "string", description: "New branch name" },
                        ref: { type: "string", description: "Source branch name or commit SHA (e.g., 'main' or 'abc123')" },
                    },
                    required: ["owner", "repo", "branch", "ref"],
                },
            },
            {
                name: "github_delete_branch",
                description: "Delete a branch from the repository",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        branch: { type: "string", description: "Branch name to delete" },
                    },
                    required: ["owner", "repo", "branch"],
                },
            },
            {
                name: "github_compare_branches",
                description: "Compare two branches and show the differences",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "Repository owner" },
                        repo: { type: "string", description: "Repository name" },
                        base: { type: "string", description: "Base branch name" },
                        head: { type: "string", description: "Head branch name to compare" },
                    },
                    required: ["owner", "repo", "base", "head"],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "github_get_issue_context") {
        try {
            const { owner, repo, issue_number } = GetIssueSchema.parse(args);

            const [issue, comments] = await Promise.all([
                octokit.rest.issues.get({ owner, repo, issue_number }),
                octokit.rest.issues.listComments({ owner, repo, issue_number }),
            ]);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                issue: {
                                    number: issue.data.number,
                                    title: issue.data.title,
                                    body: issue.data.body,
                                    state: issue.data.state,
                                    user: issue.data.user?.login,
                                    created_at: issue.data.created_at,
                                    updated_at: issue.data.updated_at,
                                    labels: issue.data.labels.map((l: any) =>
                                        typeof l === "string" ? l : l.name
                                    ),
                                },
                                comments: comments.data.map((c) => ({
                                    id: c.id,
                                    user: c.user?.login,
                                    body: c.body,
                                    created_at: c.created_at,
                                    html_url: c.html_url,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const issueNum = args && typeof args === 'object' && 'issue_number' in args ? args.issue_number : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to fetch issue #${issueNum} from ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_get_pr_context") {
        try {
            const { owner, repo, pull_number } = GetPRSchema.parse(args);

            const [pr, comments, commits] = await Promise.all([
                octokit.rest.pulls.get({ owner, repo, pull_number }),
                octokit.rest.issues.listComments({ owner, repo, issue_number: pull_number }),
                octokit.rest.pulls.listCommits({ owner, repo, pull_number }),
            ]);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                pull_request: {
                                    number: pr.data.number,
                                    title: pr.data.title,
                                    body: pr.data.body,
                                    state: pr.data.state,
                                    user: pr.data.user?.login,
                                    created_at: pr.data.created_at,
                                    updated_at: pr.data.updated_at,
                                    merged_at: pr.data.merged_at,
                                    base: pr.data.base.ref,
                                    head: pr.data.head.ref,
                                    labels: pr.data.labels.map((l: any) =>
                                        typeof l === "string" ? l : l.name
                                    ),
                                },
                                comments: comments.data.map((c) => ({
                                    id: c.id,
                                    user: c.user?.login,
                                    body: c.body,
                                    created_at: c.created_at,
                                    html_url: c.html_url,
                                })),
                                commits: commits.data.map((c) => ({
                                    sha: c.sha,
                                    message: c.commit.message,
                                    author: c.commit.author?.name,
                                    date: c.commit.author?.date,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const pullNum = args && typeof args === 'object' && 'pull_number' in args ? args.pull_number : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to fetch PR #${pullNum} from ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_create_issue") {
        try {
            const { owner, repo, title, body, labels, assignees } = CreateIssueSchema.parse(args);

            const issue = await octokit.rest.issues.create({
                owner,
                repo,
                title,
                body,
                labels,
                assignees,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                issue: {
                                    number: issue.data.number,
                                    title: issue.data.title,
                                    state: issue.data.state,
                                    html_url: issue.data.html_url,
                                    created_at: issue.data.created_at,
                                },
                                message: `Issue #${issue.data.number} created successfully`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            const title = args && typeof args === 'object' && 'title' in args ? args.title : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to create issue "${title}" in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_update_issue") {
        try {
            const { owner, repo, issue_number, title, body, state, labels, assignees } = UpdateIssueSchema.parse(args);

            const issue = await octokit.rest.issues.update({
                owner,
                repo,
                issue_number,
                title,
                body,
                state,
                labels,
                assignees,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                issue: {
                                    number: issue.data.number,
                                    title: issue.data.title,
                                    state: issue.data.state,
                                    html_url: issue.data.html_url,
                                    updated_at: issue.data.updated_at,
                                },
                                message: `Issue #${issue.data.number} updated successfully`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const issueNum = args && typeof args === 'object' && 'issue_number' in args ? args.issue_number : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to update issue #${issueNum} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_create_pr") {
        try {
            const { owner, repo, title, body, head, base, draft, maintainer_can_modify } = CreatePRSchema.parse(args);

            const pr = await octokit.rest.pulls.create({
                owner,
                repo,
                title,
                body,
                head,
                base,
                draft,
                maintainer_can_modify,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                pull_request: {
                                    number: pr.data.number,
                                    title: pr.data.title,
                                    state: pr.data.state,
                                    html_url: pr.data.html_url,
                                    draft: pr.data.draft,
                                    head: pr.data.head.ref,
                                    base: pr.data.base.ref,
                                    created_at: pr.data.created_at,
                                },
                                message: `PR #${pr.data.number} created successfully`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            const title = args && typeof args === 'object' && 'title' in args ? args.title : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to create PR "${title}" in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_add_comment") {
        try {
            const { owner, repo, issue_number, body } = AddCommentSchema.parse(args);

            const comment = await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number,
                body,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                comment: {
                                    id: comment.data.id,
                                    body: comment.data.body,
                                    user: comment.data.user?.login,
                                    html_url: comment.data.html_url,
                                    created_at: comment.data.created_at,
                                },
                                message: `Comment added successfully to issue/PR #${issue_number}`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const issueNum = args && typeof args === 'object' && 'issue_number' in args ? args.issue_number : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to add comment to issue/PR #${issueNum} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_update_comment") {
        try {
            const { owner, repo, comment_id, body } = UpdateCommentSchema.parse(args);

            const comment = await octokit.rest.issues.updateComment({
                owner,
                repo,
                comment_id,
                body,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                comment: {
                                    id: comment.data.id,
                                    body: comment.data.body,
                                    user: comment.data.user?.login,
                                    html_url: comment.data.html_url,
                                    updated_at: comment.data.updated_at,
                                },
                                message: `Comment #${comment_id} updated successfully`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const commentId = args && typeof args === 'object' && 'comment_id' in args ? args.comment_id : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to update comment #${commentId} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_delete_comment") {
        try {
            const { owner, repo, comment_id } = DeleteCommentSchema.parse(args);

            await octokit.rest.issues.deleteComment({
                owner,
                repo,
                comment_id,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Comment #${comment_id} deleted successfully`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const commentId = args && typeof args === 'object' && 'comment_id' in args ? args.comment_id : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to delete comment #${commentId} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_add_reaction") {
        try {
            const { owner, repo, comment_id, issue_number, reaction } = AddReactionSchema.parse(args);

            let reactionResponse;
            let target = "";

            const githubReaction = REACTION_MAP[reaction] || reaction;

            if (comment_id) {
                // Add reaction to a comment
                reactionResponse = await octokit.rest.reactions.createForIssueComment({
                    owner,
                    repo,
                    comment_id,
                    content: githubReaction as any,
                });
                target = `comment #${comment_id}`;
            } else if (issue_number) {
                // Add reaction to an issue/PR
                reactionResponse = await octokit.rest.reactions.createForIssue({
                    owner,
                    repo,
                    issue_number,
                    content: githubReaction as any,
                });
                target = `issue/PR #${issue_number}`;
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                reaction: {
                                    id: reactionResponse!.data.id,
                                    content: reactionResponse!.data.content,
                                    user: reactionResponse!.data.user?.login,
                                    created_at: reactionResponse!.data.created_at,
                                },
                                message: `Reaction "${reaction}" added successfully to ${target}`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const commentId = args && typeof args === 'object' && 'comment_id' in args ? args.comment_id : undefined;
            const issueNum = args && typeof args === 'object' && 'issue_number' in args ? args.issue_number : undefined;
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            const reaction = args && typeof args === 'object' && 'reaction' in args ? args.reaction : 'unknown';
            const target = commentId ? `comment #${commentId}` : issueNum ? `issue/PR #${issueNum}` : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to add reaction "${reaction}" to ${target} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_search_issues") {
        try {
            const { owner, repo, query, state, labels, sort, direction, per_page } = SearchIssuesSchema.parse(args);

            const issues = await octokit.rest.issues.listForRepo({
                owner,
                repo,
                state: state || "open",
                labels: labels?.join(","),
                sort: sort as any,
                direction: direction as any,
                per_page: per_page || 30,
            });

            // Filter out pull requests first
            const issuesOnly = issues.data.filter(issue => !issue.pull_request);
            const filteredIssues = query
                ? issues.data.filter(issue => !issue.pull_request).filter(issue =>
                    issue.title.toLowerCase().includes(query.toLowerCase()) ||
                    issue.body?.toLowerCase().includes(query.toLowerCase())
                )
                : issues.data.filter(issue => !issue.pull_request);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                total_count: filteredIssues.length,
                                issues: filteredIssues.map(issue => ({
                                    number: issue.number,
                                    title: issue.title,
                                    state: issue.state,
                                    user: issue.user?.login,
                                    labels: issue.labels.map((l: any) => typeof l === "string" ? l : l.name),
                                    created_at: issue.created_at,
                                    updated_at: issue.updated_at,
                                    comments: issue.comments,
                                    html_url: issue.html_url,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to search issues in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_search_prs") {
        try {
            const { owner, repo, query, state, sort, direction, per_page } = SearchPRsSchema.parse(args);

            const prs = await octokit.rest.pulls.list({
                owner,
                repo,
                state: state || "open",
                sort: sort as any,
                direction: direction as any,
                per_page: per_page || 30,
            });

            const filteredPRs = query
                ? prs.data.filter(pr =>
                    pr.title.toLowerCase().includes(query.toLowerCase()) ||
                    pr.body?.toLowerCase().includes(query.toLowerCase())
                )
                : prs.data;

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                total_count: filteredPRs.length,
                                pull_requests: filteredPRs.map(pr => ({
                                    number: pr.number,
                                    title: pr.title,
                                    state: pr.state,
                                    user: pr.user?.login,
                                    head: pr.head.ref,
                                    base: pr.base.ref,
                                    created_at: pr.created_at,
                                    updated_at: pr.updated_at,
                                    draft: pr.draft,
                                    html_url: pr.html_url,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to search PRs in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_list_recent_issues") {
        try {
            const { owner, repo, state, sort, per_page } = ListRecentIssuesSchema.parse(args);

            const issues = await octokit.rest.issues.listForRepo({
                owner,
                repo,
                state: state || "open",
                sort: sort || "created",
                direction: "desc",
                per_page: per_page || 30,
            });

            // Filter out pull requests (GitHub API returns both issues and PRs)
            const actualIssues = issues.data.filter(issue => !issue.pull_request);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                count: actualIssues.length,
                                issues: actualIssues.map(issue => ({
                                    number: issue.number,
                                    title: issue.title,
                                    state: issue.state,
                                    user: issue.user?.login,
                                    labels: issue.labels.map((l: any) => typeof l === "string" ? l : l.name),
                                    created_at: issue.created_at,
                                    updated_at: issue.updated_at,
                                    comments: issue.comments,
                                    html_url: issue.html_url,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to list recent issues in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_merge_pr") {
        try {
            const { owner, repo, pull_number, merge_method, commit_title, commit_message } = MergePRSchema.parse(args);

            const result = await octokit.rest.pulls.merge({
                owner,
                repo,
                pull_number,
                merge_method: merge_method as any,
                commit_title,
                commit_message,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                merged: result.data.merged,
                                sha: result.data.sha,
                                message: result.data.message,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const pullNum = args && typeof args === 'object' && 'pull_number' in args ? args.pull_number : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to merge PR #${pullNum} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_get_pr_diff") {
        try {
            const { owner, repo, pull_number } = GetPRDiffSchema.parse(args);

            const diff = await octokit.rest.pulls.get({
                owner,
                repo,
                pull_number,
                mediaType: {
                    format: "diff",
                },
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                pull_number,
                                diff: diff.data as any,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const pullNum = args && typeof args === 'object' && 'pull_number' in args ? args.pull_number : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to get diff for PR #${pullNum} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_get_pr_files") {
        try {
            const { owner, repo, pull_number } = GetPRFilesSchema.parse(args);

            const files = await octokit.rest.pulls.listFiles({
                owner,
                repo,
                pull_number,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                pull_number,
                                total_files: files.data.length,
                                files: files.data.map(file => ({
                                    filename: file.filename,
                                    status: file.status,
                                    additions: file.additions,
                                    deletions: file.deletions,
                                    changes: file.changes,
                                    blob_url: file.blob_url,
                                    raw_url: file.raw_url,
                                    patch: file.patch,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const pullNum = args && typeof args === 'object' && 'pull_number' in args ? args.pull_number : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to get files for PR #${pullNum} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_create_label") {
        try {
            const { owner, repo, name: labelName, color, description } = CreateLabelSchema.parse(args);

            const label = await octokit.rest.issues.createLabel({
                owner,
                repo,
                name: labelName,
                color,
                description,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                label: {
                                    name: label.data.name,
                                    color: label.data.color,
                                    description: label.data.description,
                                    url: label.data.url,
                                },
                                message: `Label "${labelName}" created successfully`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const labelName = args && typeof args === 'object' && 'name' in args ? args.name : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to create label "${labelName}" in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_update_label") {
        try {
            const { owner, repo, name: currentName, new_name, color, description } = UpdateLabelSchema.parse(args);

            const label = await octokit.rest.issues.updateLabel({
                owner,
                repo,
                name: currentName,
                new_name,
                color,
                description,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                label: {
                                    name: label.data.name,
                                    color: label.data.color,
                                    description: label.data.description,
                                    url: label.data.url,
                                },
                                message: `Label "${currentName}" updated successfully`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const labelName = args && typeof args === 'object' && 'name' in args ? args.name : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to update label "${labelName}" in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_delete_label") {
        try {
            const { owner, repo, name: labelName } = DeleteLabelSchema.parse(args);

            await octokit.rest.issues.deleteLabel({
                owner,
                repo,
                name: labelName,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Label "${labelName}" deleted successfully from ${owner}/${repo}`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const labelName = args && typeof args === 'object' && 'name' in args ? args.name : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to delete label "${labelName}" from ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_list_labels") {
        try {
            const { owner, repo, per_page } = ListLabelsSchema.parse(args);

            const labels = await octokit.rest.issues.listLabelsForRepo({
                owner,
                repo,
                per_page,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                count: labels.data.length,
                                labels: labels.data.map((label) => ({
                                    name: label.name,
                                    color: label.color,
                                    description: label.description,
                                    url: label.url,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to list labels for ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_list_branches") {
        try {
            const { owner, repo, protected: isProtected, per_page } = ListBranchesSchema.parse(args);

            const branches = await octokit.rest.repos.listBranches({
                owner,
                repo,
                protected: isProtected,
                per_page,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                count: branches.data.length,
                                branches: branches.data.map((branch) => ({
                                    name: branch.name,
                                    commit: {
                                        sha: branch.commit.sha,
                                        url: branch.commit.url,
                                    },
                                    protected: branch.protected,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to list branches for ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_create_branch") {
        try {
            const { owner, repo, branch, ref } = CreateBranchSchema.parse(args);

            // Get the SHA of the source ref
            let sha: string;
            try {
                // Try to get ref as a branch first
                const refData = await octokit.rest.git.getRef({
                    owner,
                    repo,
                    ref: `heads/${ref}`,
                });
                sha = refData.data.object.sha;
            } catch {
                // If not a branch, try as a commit SHA
                const commit = await octokit.rest.git.getCommit({
                    owner,
                    repo,
                    commit_sha: ref,
                });
                sha = commit.data.sha;
            }

            // Create the new branch
            const newBranch = await octokit.rest.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branch}`,
                sha,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                branch: {
                                    name: branch,
                                    ref: newBranch.data.ref,
                                    sha: newBranch.data.object.sha,
                                    url: newBranch.data.url,
                                },
                                message: `Branch "${branch}" created successfully from "${ref}"`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const branchName = args && typeof args === 'object' && 'branch' in args ? args.branch : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to create branch "${branchName}" in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_delete_branch") {
        try {
            const { owner, repo, branch } = DeleteBranchSchema.parse(args);

            await octokit.rest.git.deleteRef({
                owner,
                repo,
                ref: `heads/${branch}`,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Branch "${branch}" deleted successfully from ${owner}/${repo}`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const branchName = args && typeof args === 'object' && 'branch' in args ? args.branch : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to delete branch "${branchName}" from ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    if (name === "github_compare_branches") {
        try {
            const { owner, repo, base, head } = CompareBranchesSchema.parse(args);

            const comparison = await octokit.rest.repos.compareCommits({
                owner,
                repo,
                base,
                head,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
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
                                    commits: comparison.data.commits.map((commit) => ({
                                        sha: commit.sha,
                                        message: commit.commit.message,
                                        author: commit.commit.author?.name,
                                        date: commit.commit.author?.date,
                                    })),
                                    files: comparison.data.files?.map((file) => ({
                                        filename: file.filename,
                                        status: file.status,
                                        additions: file.additions,
                                        deletions: file.deletions,
                                        changes: file.changes,
                                    })),
                                },
                                message: `Comparing ${base}...${head}: ${comparison.data.ahead_by} commits ahead, ${comparison.data.behind_by} commits behind`,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            const base = args && typeof args === 'object' && 'base' in args ? args.base : 'unknown';
            const head = args && typeof args === 'object' && 'head' in args ? args.head : 'unknown';
            const owner = args && typeof args === 'object' && 'owner' in args ? args.owner : 'unknown';
            const repo = args && typeof args === 'object' && 'repo' in args ? args.repo : 'unknown';
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: error.message,
                            status: error.status,
                            detail: `Failed to compare branches ${base}...${head} in ${owner}/${repo}`,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    }

    throw new Error(`Unknown tool: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("issue-scribe-mcp server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
