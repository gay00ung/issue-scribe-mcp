import { Octokit } from "@octokit/rest";

import { getGithubToken } from "./env.js";
import { SERVER_VERSION } from "./version.js";

let octokitInstance: Octokit | null = null;

export function getOctokit(): Octokit {
    if (!octokitInstance) {
        octokitInstance = new Octokit({
            auth: getGithubToken(),
            userAgent: `issue-scribe-mcp/${SERVER_VERSION}`,
        });
    }

    return octokitInstance;
}
