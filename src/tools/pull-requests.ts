import { z } from "zod";

import { ToolValidationError } from "../lib/errors.js";
import { getOctokit } from "../lib/octokit.js";
import { collectPaginated, PaginationSchema, resolvePagination } from "../lib/pagination.js";
import { executeTool } from "../lib/response.js";
import { buildRepositorySearchQuery, normalizeSearchSort } from "../lib/search.js";
import { assertConfirmation, assertExpectedValue } from "../lib/safety.js";
import type { ToolRegistration } from "./types.js";

const GetPRContextSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
    include_reviews: z.boolean().optional(),
    include_review_comments: z.boolean().optional(),
    include_files: z.boolean().optional(),
    include_file_patches: z.boolean().optional(),
    include_ci: z.boolean().optional(),
}).merge(PaginationSchema);

const CreatePRSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    head: z.string(),
    base: z.string(),
    draft: z.boolean().optional(),
    maintainer_can_modify: z.boolean().optional(),
});

const MergePRSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
    merge_method: z.enum(["merge", "squash", "rebase"]).optional(),
    commit_title: z.string().optional(),
    commit_message: z.string().optional(),
    dry_run: z.boolean().optional(),
    expected_head_sha: z.string().optional(),
    confirm_token: z.string().optional(),
});

const SearchPRsSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    query: z.string().optional(),
    state: z.enum(["open", "closed", "all"]).optional(),
    qualifiers: z.array(z.string()).optional(),
    sort: z.enum(["created", "updated", "comments", "best-match", "popularity", "long-running"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
}).merge(PaginationSchema);

const GetPRDiffSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
    max_chars: z.number().int().min(1).optional(),
});

const GetPRFilesSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
    include_patch: z.boolean().optional(),
}).merge(PaginationSchema);

interface ReviewSummary {
    total_reviews: number;
    latest_state_by_reviewer: Record<string, string>;
    approved_by: string[];
    changes_requested_by: string[];
    commented_by: string[];
}

function summarizeReviews(reviews: Array<{ user?: { login?: string | null } | null; state: string; submitted_at?: string | null }>): ReviewSummary {
    const sorted = [...reviews].sort((a, b) => {
        const left = a.submitted_at ? Date.parse(a.submitted_at) : 0;
        const right = b.submitted_at ? Date.parse(b.submitted_at) : 0;
        return left - right;
    });

    const latestByReviewer = new Map<string, string>();

    for (const review of sorted) {
        const reviewer = review.user?.login;
        if (!reviewer) {
            continue;
        }

        latestByReviewer.set(reviewer, review.state);
    }

    const approvedBy: string[] = [];
    const changesRequestedBy: string[] = [];
    const commentedBy: string[] = [];

    for (const [reviewer, state] of latestByReviewer.entries()) {
        if (state === "APPROVED") {
            approvedBy.push(reviewer);
        } else if (state === "CHANGES_REQUESTED") {
            changesRequestedBy.push(reviewer);
        } else if (state === "COMMENTED") {
            commentedBy.push(reviewer);
        }
    }

    return {
        total_reviews: reviews.length,
        latest_state_by_reviewer: Object.fromEntries(latestByReviewer.entries()),
        approved_by: approvedBy,
        changes_requested_by: changesRequestedBy,
        commented_by: commentedBy,
    };
}

async function listCheckRuns(
    owner: string,
    repo: string,
    ref: string,
    page: number,
    perPage: number,
    fetchAll: boolean
) {
    if (!fetchAll) {
        const result = await getOctokit().rest.checks.listForRef({
            owner,
            repo,
            ref,
            page,
            per_page: perPage,
        });

        return {
            total_count: result.data.total_count,
            check_runs: result.data.check_runs,
            pagination: {
                page,
                per_page: perPage,
                fetch_all: false,
                pages_fetched: 1,
            },
        };
    }

    const allRuns: any[] = [];
    let currentPage = page;
    let pagesFetched = 0;
    let totalCount = 0;

    while (true) {
        const result = await getOctokit().rest.checks.listForRef({
            owner,
            repo,
            ref,
            page: currentPage,
            per_page: perPage,
        });

        if (pagesFetched === 0) {
            totalCount = result.data.total_count;
        }

        allRuns.push(...result.data.check_runs);
        pagesFetched += 1;

        if (result.data.check_runs.length < perPage) {
            break;
        }

        if (allRuns.length >= totalCount) {
            break;
        }

        currentPage += 1;
    }

    return {
        total_count: totalCount,
        check_runs: allRuns,
        pagination: {
            page,
            per_page: perPage,
            fetch_all: true,
            pages_fetched: pagesFetched,
        },
    };
}

async function searchPRsWithPagination(args: z.infer<typeof SearchPRsSchema>) {
    const pagination = resolvePagination(args, {
        page: 1,
        perPage: 30,
        fetchAll: false,
    });

    const q = buildRepositorySearchQuery({
        owner: args.owner,
        repo: args.repo,
        kind: "pr",
        state: args.state,
        query: args.query,
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

        const pullRequests = response.data.items.filter((item) => "pull_request" in item);

        return {
            query: q,
            total_count: response.data.total_count,
            incomplete_results: response.data.incomplete_results,
            page: pagination.page,
            per_page: pagination.perPage,
            fetch_all: false,
            count: pullRequests.length,
            pull_requests: pullRequests.map((pr) => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                user: pr.user?.login,
                comments: pr.comments,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                html_url: pr.html_url,
                score: pr.score,
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

    const pullRequests = allItems.filter((item) => "pull_request" in item);

    return {
        query: q,
        total_count: totalCount,
        incomplete_results: incompleteResults,
        page: pagination.page,
        per_page: pagination.perPage,
        fetch_all: true,
        pages_fetched: page - pagination.page + 1,
        count: pullRequests.length,
        pull_requests: pullRequests.map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            user: pr.user?.login,
            comments: pr.comments,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            html_url: pr.html_url,
            score: pr.score,
        })),
    };
}

export const pullRequestTools: ToolRegistration[] = [
    {
        definition: {
            name: "github_get_pr_context",
            description: "Get full PR context including issue comments, commits, reviews, review comments, changed files, and CI checks",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    pull_number: { type: "number", description: "Pull request number" },
                    include_reviews: { type: "boolean", description: "Include PR reviews and approval summary (optional, default: true)" },
                    include_review_comments: { type: "boolean", description: "Include line-level review comments (optional, default: true)" },
                    include_files: { type: "boolean", description: "Include changed files (optional, default: true)" },
                    include_file_patches: { type: "boolean", description: "Include patch text for files (optional, default: false)" },
                    include_ci: { type: "boolean", description: "Include combined status + check runs (optional, default: true)" },
                    page: { type: "number", description: "Page number for paginated collections (optional, default: 1)" },
                    per_page: { type: "number", description: "Items per page for paginated collections (optional, default: 100)" },
                    fetch_all: { type: "boolean", description: "Fetch all pages for comments/commits/reviews/files/check-runs (optional, default: true)" },
                },
                required: ["owner", "repo", "pull_number"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            GetPRContextSchema,
            "Failed to fetch PR context",
            async (args) => {
                const pagination = resolvePagination(args, {
                    page: 1,
                    perPage: 100,
                    fetchAll: true,
                });

                const includeReviews = args.include_reviews ?? true;
                const includeReviewComments = args.include_review_comments ?? true;
                const includeFiles = args.include_files ?? true;
                const includeFilePatches = args.include_file_patches ?? false;
                const includeCI = args.include_ci ?? true;

                const pr = await getOctokit().rest.pulls.get({
                    owner: args.owner,
                    repo: args.repo,
                    pull_number: args.pull_number,
                });

                const issueCommentsPromise = collectPaginated(pagination, async (page, perPage) => {
                    const response = await getOctokit().rest.issues.listComments({
                        owner: args.owner,
                        repo: args.repo,
                        issue_number: args.pull_number,
                        page,
                        per_page: perPage,
                    });
                    return response.data;
                });

                const commitsPromise = collectPaginated(pagination, async (page, perPage) => {
                    const response = await getOctokit().rest.pulls.listCommits({
                        owner: args.owner,
                        repo: args.repo,
                        pull_number: args.pull_number,
                        page,
                        per_page: perPage,
                    });
                    return response.data;
                });

                const reviewsPromise = includeReviews
                    ? collectPaginated(pagination, async (page, perPage) => {
                        const response = await getOctokit().rest.pulls.listReviews({
                            owner: args.owner,
                            repo: args.repo,
                            pull_number: args.pull_number,
                            page,
                            per_page: perPage,
                        });
                        return response.data;
                    })
                    : Promise.resolve(null);

                const reviewCommentsPromise = includeReviewComments
                    ? collectPaginated(pagination, async (page, perPage) => {
                        const response = await getOctokit().rest.pulls.listReviewComments({
                            owner: args.owner,
                            repo: args.repo,
                            pull_number: args.pull_number,
                            page,
                            per_page: perPage,
                        });
                        return response.data;
                    })
                    : Promise.resolve(null);

                const filesPromise = includeFiles
                    ? collectPaginated(pagination, async (page, perPage) => {
                        const response = await getOctokit().rest.pulls.listFiles({
                            owner: args.owner,
                            repo: args.repo,
                            pull_number: args.pull_number,
                            page,
                            per_page: perPage,
                        });
                        return response.data;
                    })
                    : Promise.resolve(null);

                const ciPromise = includeCI
                    ? Promise.all([
                        getOctokit().rest.repos.getCombinedStatusForRef({
                            owner: args.owner,
                            repo: args.repo,
                            ref: pr.data.head.sha,
                        }),
                        listCheckRuns(
                            args.owner,
                            args.repo,
                            pr.data.head.sha,
                            pagination.page,
                            pagination.perPage,
                            pagination.fetchAll
                        ),
                    ])
                    : Promise.resolve(null);

                const [issueComments, commits, reviews, reviewComments, files, ci] = await Promise.all([
                    issueCommentsPromise,
                    commitsPromise,
                    reviewsPromise,
                    reviewCommentsPromise,
                    filesPromise,
                    ciPromise,
                ]);

                const reviewSummary = reviews ? summarizeReviews(reviews.items) : null;

                return {
                    pull_request: {
                        number: pr.data.number,
                        title: pr.data.title,
                        body: pr.data.body,
                        state: pr.data.state,
                        draft: pr.data.draft,
                        mergeable: pr.data.mergeable,
                        mergeable_state: pr.data.mergeable_state,
                        user: pr.data.user?.login,
                        assignees: pr.data.assignees?.map((assignee) => assignee.login),
                        requested_reviewers: pr.data.requested_reviewers?.map((reviewer) => reviewer.login),
                        labels: pr.data.labels.map((label) => (typeof label === "string" ? label : label.name)),
                        base: pr.data.base.ref,
                        head: pr.data.head.ref,
                        head_sha: pr.data.head.sha,
                        created_at: pr.data.created_at,
                        updated_at: pr.data.updated_at,
                        merged_at: pr.data.merged_at,
                        html_url: pr.data.html_url,
                    },
                    issue_comments: issueComments.items.map((comment) => ({
                        id: comment.id,
                        user: comment.user?.login,
                        body: comment.body,
                        created_at: comment.created_at,
                        updated_at: comment.updated_at,
                        html_url: comment.html_url,
                    })),
                    commits: commits.items.map((commit) => ({
                        sha: commit.sha,
                        message: commit.commit.message,
                        author: commit.commit.author?.name,
                        date: commit.commit.author?.date,
                        html_url: commit.html_url,
                    })),
                    reviews: reviews
                        ? {
                            items: reviews.items.map((review) => ({
                                id: review.id,
                                user: review.user?.login,
                                state: review.state,
                                body: review.body,
                                submitted_at: review.submitted_at,
                                commit_id: review.commit_id,
                            })),
                            summary: reviewSummary,
                            pagination: {
                                page: reviews.page,
                                per_page: reviews.per_page,
                                fetch_all: reviews.fetch_all,
                                pages_fetched: reviews.pages_fetched,
                            },
                        }
                        : null,
                    review_comments: reviewComments
                        ? {
                            items: reviewComments.items.map((comment) => ({
                                id: comment.id,
                                user: comment.user?.login,
                                body: comment.body,
                                path: comment.path,
                                line: comment.line,
                                side: comment.side,
                                commit_id: comment.commit_id,
                                created_at: comment.created_at,
                                updated_at: comment.updated_at,
                                html_url: comment.html_url,
                            })),
                            pagination: {
                                page: reviewComments.page,
                                per_page: reviewComments.per_page,
                                fetch_all: reviewComments.fetch_all,
                                pages_fetched: reviewComments.pages_fetched,
                            },
                        }
                        : null,
                    files: files
                        ? {
                            items: files.items.map((file) => ({
                                filename: file.filename,
                                status: file.status,
                                additions: file.additions,
                                deletions: file.deletions,
                                changes: file.changes,
                                blob_url: file.blob_url,
                                raw_url: file.raw_url,
                                patch: includeFilePatches ? file.patch : undefined,
                            })),
                            pagination: {
                                page: files.page,
                                per_page: files.per_page,
                                fetch_all: files.fetch_all,
                                pages_fetched: files.pages_fetched,
                            },
                        }
                        : null,
                    ci: ci
                        ? {
                            combined_status: {
                                state: ci[0].data.state,
                                sha: ci[0].data.sha,
                                total_count: ci[0].data.total_count,
                                statuses: ci[0].data.statuses.map((status) => ({
                                    context: status.context,
                                    state: status.state,
                                    description: status.description,
                                    target_url: status.target_url,
                                    created_at: status.created_at,
                                    updated_at: status.updated_at,
                                })),
                            },
                            checks: {
                                total_count: ci[1].total_count,
                                check_runs: ci[1].check_runs.map((checkRun) => ({
                                    id: checkRun.id,
                                    name: checkRun.name,
                                    status: checkRun.status,
                                    conclusion: checkRun.conclusion,
                                    started_at: checkRun.started_at,
                                    completed_at: checkRun.completed_at,
                                    details_url: checkRun.details_url,
                                })),
                                pagination: ci[1].pagination,
                            },
                        }
                        : null,
                    pagination: {
                        page: pagination.page,
                        per_page: pagination.perPage,
                        fetch_all: pagination.fetchAll,
                        issue_comments_pages_fetched: issueComments.pages_fetched,
                        commits_pages_fetched: commits.pages_fetched,
                    },
                };
            }
        ),
    },
    {
        definition: {
            name: "github_create_pr",
            description: "Create a new pull request",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    title: { type: "string", description: "PR title" },
                    body: { type: "string", description: "PR description (optional)" },
                    head: { type: "string", description: "Source branch" },
                    base: { type: "string", description: "Target branch" },
                    draft: { type: "boolean", description: "Create as draft PR (optional)" },
                    maintainer_can_modify: { type: "boolean", description: "Allow maintainer edits (optional)" },
                },
                required: ["owner", "repo", "title", "head", "base"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            CreatePRSchema,
            "Failed to create PR",
            async (args) => {
                const pr = await getOctokit().rest.pulls.create({
                    owner: args.owner,
                    repo: args.repo,
                    title: args.title,
                    body: args.body,
                    head: args.head,
                    base: args.base,
                    draft: args.draft,
                    maintainer_can_modify: args.maintainer_can_modify,
                });

                return {
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
                };
            }
        ),
    },
    {
        definition: {
            name: "github_search_prs",
            description: "Search repository pull requests using GitHub Search API and optional qualifiers",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    query: { type: "string", description: "Search text (optional)" },
                    state: { type: "string", enum: ["open", "closed", "all"], description: "PR state (optional)" },
                    qualifiers: { type: "array", items: { type: "string" }, description: "Extra GitHub search qualifiers like author:foo (optional)" },
                    sort: { type: "string", enum: ["created", "updated", "comments", "best-match", "popularity", "long-running"], description: "Sort strategy (optional)" },
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
            SearchPRsSchema,
            "Failed to search PRs",
            async (args) => searchPRsWithPagination(args)
        ),
    },
    {
        definition: {
            name: "github_merge_pr",
            description: "Merge a pull request with dry-run, expected HEAD SHA check, and confirmation safeguards",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    pull_number: { type: "number", description: "PR number" },
                    merge_method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method (optional, default: merge)" },
                    commit_title: { type: "string", description: "Custom merge commit title (optional)" },
                    commit_message: { type: "string", description: "Custom merge commit message (optional)" },
                    dry_run: { type: "boolean", description: "Preview merge without executing (optional, default: false)" },
                    expected_head_sha: { type: "string", description: "Optional guard: PR head SHA must match this value" },
                    confirm_token: { type: "string", description: "Must be \"CONFIRM\" to execute merge when dry_run=false" },
                },
                required: ["owner", "repo", "pull_number"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            MergePRSchema,
            "Failed to merge PR",
            async (args) => {
                const pr = await getOctokit().rest.pulls.get({
                    owner: args.owner,
                    repo: args.repo,
                    pull_number: args.pull_number,
                });

                if (pr.data.state !== "open") {
                    throw new ToolValidationError(`PR #${args.pull_number} is not open`, 409);
                }

                assertExpectedValue(args.expected_head_sha, pr.data.head.sha, "pr head sha");

                if (args.dry_run ?? false) {
                    return {
                        success: true,
                        dry_run: true,
                        action: "merge_pr",
                        target: {
                            pull_number: args.pull_number,
                            title: pr.data.title,
                            head: pr.data.head.ref,
                            base: pr.data.base.ref,
                            head_sha: pr.data.head.sha,
                            mergeable: pr.data.mergeable,
                            mergeable_state: pr.data.mergeable_state,
                        },
                        message: "Dry run only. No merge executed.",
                    };
                }

                assertConfirmation(args.confirm_token, "PR merge");

                const mergeResult = await getOctokit().rest.pulls.merge({
                    owner: args.owner,
                    repo: args.repo,
                    pull_number: args.pull_number,
                    merge_method: args.merge_method,
                    commit_title: args.commit_title,
                    commit_message: args.commit_message,
                });

                return {
                    success: true,
                    dry_run: false,
                    merged: mergeResult.data.merged,
                    sha: mergeResult.data.sha,
                    message: mergeResult.data.message,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_get_pr_diff",
            description: "Get full PR diff with optional output truncation",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    pull_number: { type: "number", description: "PR number" },
                    max_chars: { type: "number", description: "Maximum diff characters to return (optional)" },
                },
                required: ["owner", "repo", "pull_number"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            GetPRDiffSchema,
            "Failed to get PR diff",
            async (args) => {
                const diff = await getOctokit().rest.pulls.get({
                    owner: args.owner,
                    repo: args.repo,
                    pull_number: args.pull_number,
                    mediaType: {
                        format: "diff",
                    },
                });

                const diffText = typeof diff.data === "string" ? diff.data : String(diff.data);
                const maxChars = args.max_chars;
                const truncated = Boolean(maxChars && diffText.length > maxChars);

                return {
                    pull_number: args.pull_number,
                    max_chars: maxChars,
                    total_chars: diffText.length,
                    truncated,
                    diff: truncated ? diffText.slice(0, maxChars) : diffText,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_get_pr_files",
            description: "List files changed in a PR with pagination support",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    pull_number: { type: "number", description: "PR number" },
                    include_patch: { type: "boolean", description: "Include patch text per file (optional, default: true)" },
                    page: { type: "number", description: "Page number (optional, default: 1)" },
                    per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    fetch_all: { type: "boolean", description: "Fetch all pages (optional, default: false)" },
                },
                required: ["owner", "repo", "pull_number"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            GetPRFilesSchema,
            "Failed to get PR files",
            async (args) => {
                const pagination = resolvePagination(args, {
                    page: 1,
                    perPage: 30,
                    fetchAll: false,
                });

                const includePatch = args.include_patch ?? true;

                const files = await collectPaginated(pagination, async (page, perPage) => {
                    const response = await getOctokit().rest.pulls.listFiles({
                        owner: args.owner,
                        repo: args.repo,
                        pull_number: args.pull_number,
                        page,
                        per_page: perPage,
                    });
                    return response.data;
                });

                return {
                    pull_number: args.pull_number,
                    total_files: files.items.length,
                    files: files.items.map((file) => ({
                        filename: file.filename,
                        status: file.status,
                        additions: file.additions,
                        deletions: file.deletions,
                        changes: file.changes,
                        blob_url: file.blob_url,
                        raw_url: file.raw_url,
                        patch: includePatch ? file.patch : undefined,
                    })),
                    pagination: {
                        page: files.page,
                        per_page: files.per_page,
                        fetch_all: files.fetch_all,
                        pages_fetched: files.pages_fetched,
                    },
                };
            }
        ),
    },
];
