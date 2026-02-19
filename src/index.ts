#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { dispatchTool, toolDefinitions } from "./tools/index.js";
import { SERVER_VERSION } from "./lib/version.js";

const server = new Server(
    {
        name: "issue-scribe-mcp",
        version: SERVER_VERSION,
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: toolDefinitions,
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return dispatchTool(name, args);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`issue-scribe-mcp server running on stdio (v${SERVER_VERSION})`);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
