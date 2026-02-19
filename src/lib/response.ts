import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import { buildErrorPayload } from "./errors.js";

export function success(data: unknown): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}

export function failure(error: unknown, detail: string): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(buildErrorPayload(error, detail), null, 2),
            },
        ],
        isError: true,
    };
}

export async function executeTool<T>(
    rawArgs: unknown,
    schema: z.ZodType<T>,
    detail: string,
    run: (args: T) => Promise<unknown>
): Promise<CallToolResult> {
    try {
        const parsedArgs = schema.parse(rawArgs);
        const payload = await run(parsedArgs);
        return success(payload);
    } catch (error: unknown) {
        return failure(error, detail);
    }
}
