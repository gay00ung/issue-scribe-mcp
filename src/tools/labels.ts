import { z } from "zod";

import { getOctokit } from "../lib/octokit.js";
import { collectPaginated, PaginationSchema, resolvePagination } from "../lib/pagination.js";
import { executeTool } from "../lib/response.js";
import { assertConfirmation } from "../lib/safety.js";
import type { ToolRegistration } from "./types.js";

const CreateLabelSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    name: z.string(),
    color: z.string(),
    description: z.string().optional(),
});

const UpdateLabelSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    name: z.string(),
    new_name: z.string().optional(),
    color: z.string().optional(),
    description: z.string().optional(),
});

const DeleteLabelSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    name: z.string(),
    dry_run: z.boolean().optional(),
    confirm_token: z.string().optional(),
});

const ListLabelsSchema = z.object({
    owner: z.string(),
    repo: z.string(),
}).merge(PaginationSchema);

export const labelTools: ToolRegistration[] = [
    {
        definition: {
            name: "github_create_label",
            description: "Create a new repository label",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    name: { type: "string", description: "Label name" },
                    color: { type: "string", description: "Hex color without #" },
                    description: { type: "string", description: "Label description (optional)" },
                },
                required: ["owner", "repo", "name", "color"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            CreateLabelSchema,
            "Failed to create label",
            async (args) => {
                const label = await getOctokit().rest.issues.createLabel({
                    owner: args.owner,
                    repo: args.repo,
                    name: args.name,
                    color: args.color,
                    description: args.description,
                });

                return {
                    success: true,
                    label: {
                        name: label.data.name,
                        color: label.data.color,
                        description: label.data.description,
                        url: label.data.url,
                    },
                    message: `Label \"${args.name}\" created successfully`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_update_label",
            description: "Update an existing repository label",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    name: { type: "string", description: "Current label name" },
                    new_name: { type: "string", description: "New name (optional)" },
                    color: { type: "string", description: "New hex color without # (optional)" },
                    description: { type: "string", description: "New description (optional)" },
                },
                required: ["owner", "repo", "name"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            UpdateLabelSchema,
            "Failed to update label",
            async (args) => {
                const label = await getOctokit().rest.issues.updateLabel({
                    owner: args.owner,
                    repo: args.repo,
                    name: args.name,
                    new_name: args.new_name,
                    color: args.color,
                    description: args.description,
                });

                return {
                    success: true,
                    label: {
                        name: label.data.name,
                        color: label.data.color,
                        description: label.data.description,
                        url: label.data.url,
                    },
                    message: `Label \"${args.name}\" updated successfully`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_delete_label",
            description: "Delete a repository label with dry-run and confirmation safeguards",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    name: { type: "string", description: "Label name to delete" },
                    dry_run: { type: "boolean", description: "Preview deletion without executing (optional, default: false)" },
                    confirm_token: { type: "string", description: "Must be \"CONFIRM\" to execute delete when dry_run=false" },
                },
                required: ["owner", "repo", "name"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            DeleteLabelSchema,
            "Failed to delete label",
            async (args) => {
                const label = await getOctokit().rest.issues.getLabel({
                    owner: args.owner,
                    repo: args.repo,
                    name: args.name,
                });

                if (args.dry_run ?? false) {
                    return {
                        success: true,
                        dry_run: true,
                        action: "delete_label",
                        target: {
                            name: label.data.name,
                            color: label.data.color,
                            description: label.data.description,
                        },
                        message: "Dry run only. No deletion executed.",
                    };
                }

                assertConfirmation(args.confirm_token, "Label deletion");

                await getOctokit().rest.issues.deleteLabel({
                    owner: args.owner,
                    repo: args.repo,
                    name: args.name,
                });

                return {
                    success: true,
                    dry_run: false,
                    message: `Label \"${args.name}\" deleted successfully from ${args.owner}/${args.repo}`,
                };
            }
        ),
    },
    {
        definition: {
            name: "github_list_labels",
            description: "List repository labels with pagination",
            inputSchema: {
                type: "object",
                properties: {
                    owner: { type: "string", description: "Repository owner" },
                    repo: { type: "string", description: "Repository name" },
                    page: { type: "number", description: "Page number (optional, default: 1)" },
                    per_page: { type: "number", description: "Results per page, max 100 (optional, default: 30)" },
                    fetch_all: { type: "boolean", description: "Fetch all pages (optional, default: false)" },
                },
                required: ["owner", "repo"],
            },
        },
        handler: async (rawArgs) => executeTool(
            rawArgs,
            ListLabelsSchema,
            "Failed to list labels",
            async (args) => {
                const pagination = resolvePagination(args, {
                    page: 1,
                    perPage: 30,
                    fetchAll: false,
                });

                const labels = await collectPaginated(pagination, async (page, perPage) => {
                    const response = await getOctokit().rest.issues.listLabelsForRepo({
                        owner: args.owner,
                        repo: args.repo,
                        page,
                        per_page: perPage,
                    });
                    return response.data;
                });

                return {
                    success: true,
                    count: labels.items.length,
                    labels: labels.items.map((label) => ({
                        name: label.name,
                        color: label.color,
                        description: label.description,
                        url: label.url,
                    })),
                    pagination: {
                        page: labels.page,
                        per_page: labels.per_page,
                        fetch_all: labels.fetch_all,
                        pages_fetched: labels.pages_fetched,
                    },
                };
            }
        ),
    },
];
