import { z } from "zod";

import { getOctokit } from "../lib/octokit.js";
import { collectPaginated, PaginationSchema, resolvePagination } from "../lib/pagination.js";
import { executeTool } from "../lib/response.js";
import { buildRepositorySearchQuery, normalizeSearchSort } from "../lib/search.js";
import type { ToolRegistration } from "./types.js";

const IssueContextSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
    comments_page: z.number().int().min(1).optional(),
    comments_per_page: z.number().int().min(1).max(100).optional(),
    comments_fetch_all: z.boolean().optional(),
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

const SearchIssuesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    query: z.string().optional(),
    state: z.enum(["open", "closed", "all"]).optional(),
    labels: z.array(z.string()).optional(),
    qualifiers: z.array(z.string()).optional(),
    sort: z.enum(["created", "updated", "comments", "best-match"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
}).merge(PaginationSchema);

const ListRecentIssuesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).optional(),
    sort: z.enum(["created", "updated", "comments"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
}).merge(PaginationSchema);

async function searchIssuesWithPagination(args: z.infer<typeof SearchIssuesSchema>) {
    const pagination = resolvePagination(args, {
        page: 1,
        perPage: 30,
        fetchAll: false,
    });

    const q = buildRepositorySearchQuery({
        owner: args.owner,
        repo: args.repo,
        kind: "issue",
        state: args.state,
        query: args.query,
        labels: args.labels,
        qualifiers: args.qualifiers,
    });

    const sort = normalizeSearchSort(args.sort);
    const order = args.direction;

    if (!pagination.fetchAll) {
        const response = await getOctokit().rest.search.issuesAndPullRequests({
            q,
            sort: sort as any,
            order: order as any,
            page: pagination.page,
            per_page: pagination.perPage,
        });

        const issues = response.data.items.filter((item) => !("pull_request" in item));

        return {
            query: q,
            total_count: response.data.total_count,
            incomplete_results: response.data.incomplete_results,
            page: pagination.page,
            per_page: pagination.perPage,
            fetch_all: false,
            count: issues.length,
            issues: issues.map((issue) => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                user: issue.user?.login,
                labels: issue.labels,
                comments: issue.comments,
                created_at: issue.created_at,
                updated_at: issue.updated_at,
                html_url: issue.html_url,
                score: issue.score,
            })),
        };
    }

    const allItems: any[] = [];
    let page = pagination.page;
    let totalCount = 0;
    let incompleteResults = false;

    while (true) {
        const response = await getOctokit().rest.search.issuesAndPullRequests({
            q,
            sort: sort as any,
            order: order as any,
            page,
            per_page: pagination.perPage,
        });

        if (page === pagination.page) {
            totalCount = response.data.total_count;
            incompleteResults = response.data.incomplete_results;
        }

        allItems.push(...response.data.items);

        if (response.data.items.length < pagination.perPage) {
            break;
        }

        if (allItems.length >= 1000) {
            break;
        }

        page += 1;
    }

    const issues = allItems.filter((item) => !("pull_request" in item));

    return {
        query: q,
        total_count: totalCount,
        incomplete_results: incompleteResults,
        page: pagination.page,
        per_page: pagination.perPage,
        fetch_all: true,
        pages_fetched: page - pagination.page + 1,
        count: issues.length,
        issues: issues.map((issue) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            user: issue.user?.login,
            labels: issue.labels,
            comments: issue.comments,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            html_url: issue.html_url,
            score: issue.score,
        })),
    };
}

export const issueTools: ToolRegistration[] = [
    {
        definition: {
            name: "github_get_issue_context",
            description: "Get GitHub Issue context including metadata, reactions, and paginated comments",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    issue_number: { type: "number", description: "Issue number" },
                    comments_page: { type: "number", description: "Comments page number (optional, default: 1)" },
                    comments_per_page: { type: "number", description: "Comments per page, max 100 (optional, default: 100)" },
                    comments_fetch_all: { type: "boolean", description: "Fetch all comment pages (optional, default: true)" },
                },
                required: ["owner", "repo", "issue_number"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            IssueContextSchema,
            "Failed to fetch issue context",
            async (args) => {
                const issue = await getOctokit().rest.issues.get({
                    owner: args.owner,
                    repo: args.repo,
                    issue_number: args.issue_number,
                });

                const commentPagination = resolvePagination(
                    {
                        page: args.comments_page,
                        per_page: args.comments_per_page,
                        fetch_all: args.comments_fetch_all,
                    },
                    {
                        page: 1,
                        perPage: 100,
                        fetchAll: true,
                    }
                );

                const commentsResult = await collectPaginated(commentPagination, async (page, perPage) => {
                    const comments = await getOctokit().rest.issues.listComments({
                        owner: args.owner,
                        repo: args.repo,
                        issue_number: args.issue_number,
                        page,
                        per_page: perPage,
                    });
                    return comments.data;
                });

                return {
                    issue: {
                        number: issue.data.number,
                        title: issue.data.title,
                        body: issue.data.body,
                        state: issue.data.state,
                        user: issue.data.user?.login,
                        assignees: issue.data.assignees?.map((assignee) => assignee.login),
                        milestone: issue.data.milestone
                            ? {
                                title: issue.data.milestone.title,
                                due_on: issue.data.milestone.due_on,
                            }
                            : null,
                        labels: issue.data.labels.map((label) => (typeof label === "string" ? label : label.name)),
                        reactions: issue.data.reactions,
                        created_at: issue.data.created_at,
                        updated_at: issue.data.updated_at,
                        html_url: issue.data.html_url,
                    },
                    comments: commentsResult.items.map((comment) => ({
                        id: comment.id,
                        user: comment.user?.login,
                        body: comment.body,
                        reactions: comment.reactions,
                        created_at: comment.created_at,
                        updated_at: comment.updated_at,
                        html_url: comment.html_url,
                    })),
                    comments_pagination: {
                        page: commentsResult.page,
                        per_page: commentsResult.per_page,
                        fetch_all: commentsResult.fetch_all,
                        pages_fetched: commentsResult.pages_fetched,
                        count: commentsResult.items.length,
                    },
                };
            }
        ),
    },
    {
        definition: {
            name: "github_create_issue",
            description: "Create a new GitHub issue",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    title: { type: "string", description: "Issue title" },
                    body: { type: "string", description: "Issue body (optional)" },
                    labels: { type: "array", items: { type: "string" }, description: "Labels (optional)" },
                    assignees: { type: "array", items: { type: "string" }, description: "Assignees (optional)" },
                },
                required: ["owner", "repo", "title"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            CreateIssueSchema,
            "Failed to create issue",
            async (args) => {
                const issue = await getOctokit().rest.issues.create({
                    owner: args.owner,
                    repo: args.repo,
                    title: args.title,
                    body: args.body,
                    labels: args.labels,
                    assignees: args.assignees,
                });

                return {
                    success: true,
                    issue: {
                        number: issue.data.number,
                        title: issue.data.title,
                        state: issue.data.state,
                        html_url: issue.data.html_url,
                        created_at: issue.data.created_at,
                    },
                    message: `Issue #${issue.data.number} created successfully`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_update_issue",
            description: "Update an existing GitHub issue",
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
        handler: async (rawArgs) => executeTool(
            rawArgs,
            UpdateIssueSchema,
            "Failed to update issue",
            async (args) => {
                const issue = await getOctokit().rest.issues.update({
                    owner: args.owner,
                    repo: args.repo,
                    issue_number: args.issue_number,
                    title: args.title,
                    body: args.body,
                    state: args.state,
                    labels: args.labels,
                    assignees: args.assignees,
                });

                return {
                    success: true,
                    issue: {
                        number: issue.data.number,
                        title: issue.data.title,
                        state: issue.data.state,
                        html_url: issue.data.html_url,
                        updated_at: issue.data.updated_at,
                    },
                    message: `Issue #${issue.data.number} updated successfully`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_search_issues",
            description: "Search repository issues using GitHub Search API and optional qualifiers",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    query: { type: "string", description: "Search text (optional)" },
                    state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state (optional)" },
                    labels: { type: "array", items: { type: "string" }, description: "Filter by labels (optional)" },
                    qualifiers: { type: "array", items: { type: "string" }, description: "Extra GitHub search qualifiers like author:foo (optional)" },
                    sort: { type: "string", enum: ["created", "updated", "comments", "best-match"], description: "Sort strategy (optional)" },
                    direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction (optional)" },
                    page: { type: "number", description: "Page number (optional, default: 1)" },
                    per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    fetch_all: { type: "boolean", description: "Fetch all pages up to GitHub search limit (optional, default: false)" },
                },
                required: ["owner", "repo"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            SearchIssuesSchema,
            "Failed to search issues",
            async (args) => searchIssuesWithPagination(args)
        ),
    },
    {
        definition: {
            name: "github_list_recent_issues",
            description: "List recent repository issues with pagination support",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state (optional, default: open)" },
                    sort: { type: "string", enum: ["created", "updated", "comments"], description: "Sort field (optional, default: created)" },
                    direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction (optional, default: desc)" },
                    page: { type: "number", description: "Page number (optional, default: 1)" },
                    per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    fetch_all: { type: "boolean", description: "Fetch all pages (optional, default: false)" },
                },
                required: ["owner", "repo"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            ListRecentIssuesSchema,
            "Failed to list recent issues",
            async (args) => {
                const pagination = resolvePagination(args, {
                    page: 1,
                    perPage: 30,
                    fetchAll: false,
                });

                const issues = await collectPaginated(pagination, async (page, perPage) => {
                    const response = await getOctokit().rest.issues.listForRepo({
                        owner: args.owner,
                        repo: args.repo,
                        state: args.state ?? "open",
                        sort: args.sort ?? "created",
                        direction: args.direction ?? "desc",
                        page,
                        per_page: perPage,
                    });

                    return response.data.filter((issue) => !issue.pull_request);
                });

                return {
                    count: issues.items.length,
                    issues: issues.items.map((issue) => ({
                        number: issue.number,
                        title: issue.title,
                        state: issue.state,
                        user: issue.user?.login,
                        labels: issue.labels.map((label) => (typeof label === "string" ? label : label.name)),
                        created_at: issue.created_at,
                        updated_at: issue.updated_at,
                        comments: issue.comments,
                        html_url: issue.html_url,
                    })),
                    pagination: {
                        page: issues.page,
                        per_page: issues.per_page,
                        fetch_all: issues.fetch_all,
                        pages_fetched: issues.pages_fetched,
                    },
                };
            }
        ),
    },
];
