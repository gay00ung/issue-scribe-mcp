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
                name: "github.get_issue_context",
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
                name: "github.get_pr_context",
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
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "github.get_issue_context") {
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
    }

    if (name === "github.get_pr_context") {
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
