import { z } from "zod";

import { getOctokit } from "../lib/octokit.js";
import { executeTool } from "../lib/response.js";
import { assertConfirmation } from "../lib/safety.js";
import type { ToolRegistration } from "./types.js";

const REACTION_MAP: Record<string, string> = {
    thumbs_up: "+1",
    thumbs_down: "-1",
    laugh: "laugh",
    confused: "confused",
    heart: "heart",
    hooray: "hooray",
    rocket: "rocket",
    eyes: "eyes",
};

const AddCommentSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
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
    dry_run: z.boolean().optional(),
    confirm_token: z.string().optional(),
    expected_body_substring: z.string().optional(),
});

const AddReactionSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    comment_id: z.number().optional(),
    issue_number: z.number().optional(),
    reaction: z.enum(["thumbs_up", "thumbs_down", "laugh", "confused", "heart", "hooray", "rocket", "eyes"]),
}).refine((data) => Boolean(data.comment_id) !== Boolean(data.issue_number), {
    message: "Provide exactly one of comment_id or issue_number",
});

export const commentTools: ToolRegistration[] = [
    {
        definition: {
            name: "github_add_comment",
            description: "Add a comment to a GitHub issue or pull request",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    issue_number: { type: "number", description: "Issue or PR number" },
                    body: { type: "string", description: "Comment body" },
                },
                required: ["owner", "repo", "issue_number", "body"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            AddCommentSchema,
            "Failed to add comment",
            async (args) => {
                const comment = await getOctokit().rest.issues.createComment({
                    owner: args.owner,
                    repo: args.repo,
                    issue_number: args.issue_number,
                    body: args.body,
                });

                return {
                    success: true,
                    comment: {
                        id: comment.data.id,
                        body: comment.data.body,
                        user: comment.data.user?.login,
                        html_url: comment.data.html_url,
                        created_at: comment.data.created_at,
                    },
                    message: `Comment added successfully to issue/PR #${args.issue_number}`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_update_comment",
            description: "Update an existing GitHub issue/PR comment",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    comment_id: { type: "number", description: "Comment ID" },
                    body: { type: "string", description: "Updated comment body" },
                },
                required: ["owner", "repo", "comment_id", "body"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            UpdateCommentSchema,
            "Failed to update comment",
            async (args) => {
                const comment = await getOctokit().rest.issues.updateComment({
                    owner: args.owner,
                    repo: args.repo,
                    comment_id: args.comment_id,
                    body: args.body,
                });

                return {
                    success: true,
                    comment: {
                        id: comment.data.id,
                        body: comment.data.body,
                        user: comment.data.user?.login,
                        html_url: comment.data.html_url,
                        updated_at: comment.data.updated_at,
                    },
                    message: `Comment #${args.comment_id} updated successfully`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_delete_comment",
            description: "Delete a comment with dry-run and confirmation safeguards",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    comment_id: { type: "number", description: "Comment ID to delete" },
                    dry_run: { type: "boolean", description: "Preview deletion without executing (optional, default: false)" },
                    confirm_token: { type: "string", description: "Must be \"CONFIRM\" to execute delete when dry_run=false" },
                    expected_body_substring: { type: "string", description: "Optional guard: comment must include this substring" },
                },
                required: ["owner", "repo", "comment_id"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            DeleteCommentSchema,
            "Failed to delete comment",
            async (args) => {
                const comment = await getOctokit().rest.issues.getComment({
                    owner: args.owner,
                    repo: args.repo,
                    comment_id: args.comment_id,
                });

                if (args.expected_body_substring && !comment.data.body?.includes(args.expected_body_substring)) {
                    return {
                        success: false,
                        dry_run: true,
                        message: "Comment body guard check failed. Deletion skipped.",
                        expected_body_substring: args.expected_body_substring,
                        current_comment_preview: comment.data.body?.slice(0, 200) ?? "",
                    };
                }

                if (args.dry_run ?? false) {
                    return {
                        success: true,
                        dry_run: true,
                        action: "delete_comment",
                        target: {
                            comment_id: args.comment_id,
                            html_url: comment.data.html_url,
                            body_preview: comment.data.body?.slice(0, 200) ?? "",
                        },
                        message: "Dry run only. No deletion executed.",
                    };
                }

                assertConfirmation(args.confirm_token, "Comment deletion");

                await getOctokit().rest.issues.deleteComment({
                    owner: args.owner,
                    repo: args.repo,
                    comment_id: args.comment_id,
                });

                return {
                    success: true,
                    dry_run: false,
                    message: `Comment #${args.comment_id} deleted successfully`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_add_reaction",
            description: "Add a reaction to an issue/PR or to a specific comment",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    comment_id: { type: "number", description: "Comment ID target (optional)" },
                    issue_number: { type: "number", description: "Issue/PR number target (optional)" },
                    reaction: {
                        type: "string",
                        enum: ["thumbs_up", "thumbs_down", "laugh", "confused", "heart", "hooray", "rocket", "eyes"],
                        description: "Reaction type",
                    },
                },
                required: ["owner", "repo", "reaction"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            AddReactionSchema,
            "Failed to add reaction",
            async (args) => {
                const reactionContent = REACTION_MAP[args.reaction] ?? args.reaction;

                if (args.comment_id) {
                    const reaction = await getOctokit().rest.reactions.createForIssueComment({
                        owner: args.owner,
                        repo: args.repo,
                        comment_id: args.comment_id,
                        content: reactionContent as "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes",
                    });

                    return {
                        success: true,
                        target: `comment #${args.comment_id}`,
                        reaction: {
                            id: reaction.data.id,
                            content: reaction.data.content,
                            user: reaction.data.user?.login,
                            created_at: reaction.data.created_at,
                        },
                        message: `Reaction \"${args.reaction}\" added to comment #${args.comment_id}`,
                    };
                }

                const reaction = await getOctokit().rest.reactions.createForIssue({
                    owner: args.owner,
                    repo: args.repo,
                    issue_number: args.issue_number!,
                    content: reactionContent as "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes",
                });

                return {
                    success: true,
                    target: `issue/PR #${args.issue_number}`,
                    reaction: {
                        id: reaction.data.id,
                        content: reaction.data.content,
                        user: reaction.data.user?.login,
                        created_at: reaction.data.created_at,
                    },
                    message: `Reaction \"${args.reaction}\" added to issue/PR #${args.issue_number}`,
                };
            }
        ),
    },
];
