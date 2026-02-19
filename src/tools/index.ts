import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { ToolValidationError } from "../lib/errors.js";
import { failure } from "../lib/response.js";
import { branchTools } from "./branches.js";
import { commentTools } from "./comments.js";
import { issueTools } from "./issues.js";
import { labelTools } from "./labels.js";
import { pullRequestTools } from "./pull-requests.js";
import type { ToolHandler, ToolRegistration } from "./types.js";

const toolRegistry: ToolRegistration[] = [
    ...issueTools,
    ...pullRequestTools,
    ...commentTools,
    ...labelTools,
    ...branchTools,
];

const toolMap = new Map<string, ToolHandler>(
    toolRegistry.map((tool) => [tool.definition.name, tool.handler])
);

export const toolDefinitions = toolRegistry.map((tool) => tool.definition);
export const toolCount = toolDefinitions.length;

export async function dispatchTool(name: string, args: unknown): Promise<CallToolResult> {
    const handler = toolMap.get(name);

    if (!handler) {
        return failure(new ToolValidationError(`Unknown tool: ${name}`, 404), `Unknown tool requested: ${name}`);
    }

    try {
        return await handler(args);
    } catch (error: unknown) {
        return failure(error, `Unexpected error while executing tool: ${name}`);
    }
}
