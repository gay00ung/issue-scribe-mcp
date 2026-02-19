import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
}

export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

export interface ToolRegistration {
    definition: ToolDefinition;
    handler: ToolHandler;
}
