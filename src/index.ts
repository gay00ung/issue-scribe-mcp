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
                                    user: c.user?.login,
                                    body: c.body,
                                    created_at: c.created_at,
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
                                    user: c.user?.login,
                                    body: c.body,
                                    created_at: c.created_at,
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
