import { ZodError } from "zod";

export class ToolValidationError extends Error {
    public readonly status: number;

    public constructor(message: string, status = 400) {
        super(message);
        this.name = "ToolValidationError";
        this.status = status;
    }
}

type ErrorWithMetadata = Error & {
    status?: number;
    response?: {
        headers?: Record<string, string | number | undefined>;
        data?: unknown;
    };
};

function isErrorWithMetadata(error: unknown): error is ErrorWithMetadata {
    if (!(error instanceof Error)) {
        return false;
    }

    return true;
}

export function buildErrorPayload(error: unknown, detail: string): Record<string, unknown> {
    if (error instanceof ZodError) {
        return {
            error: "Invalid parameters",
            status: 400,
            detail,
            validation_issues: error.issues,
        };
    }

    if (isErrorWithMetadata(error)) {
        const payload: Record<string, unknown> = {
            error: error.message,
            status: error.status,
            detail,
        };

        const headers = error.response?.headers;
        const rateLimitRemaining = headers?.["x-ratelimit-remaining"];
        const rateLimitReset = headers?.["x-ratelimit-reset"];

        if (rateLimitRemaining !== undefined || rateLimitReset !== undefined) {
            payload.rate_limit = {
                remaining: rateLimitRemaining,
                reset: rateLimitReset,
            };
        }

        return payload;
    }

    return {
        error: "Unknown error",
        detail,
    };
}
