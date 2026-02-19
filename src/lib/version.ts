import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(currentDir, "../../package.json");

let packageVersion = "0.0.0";

try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        version?: string;
    };
    packageVersion = packageJson.version ?? packageVersion;
} catch {
    packageVersion = "0.0.0";
}

export const SERVER_VERSION = packageVersion;
