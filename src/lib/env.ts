import "dotenv/config";

import { ToolValidationError } from "./errors.js";

export function getGithubToken(): string {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new ToolValidationError(
            "GITHUB_TOKEN environment variable is required. Set it via env or .env file.",
            500
        );
    }

    return token;
}
