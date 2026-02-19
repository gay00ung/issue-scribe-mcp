import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SERVER_VERSION } from "../dist/lib/version.js";
import { toolCount, toolDefinitions } from "../dist/tools/index.js";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const testLocalScript = readFileSync(new URL("../test-local.sh", import.meta.url), "utf8");
const readmeKo = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const readmeEn = readFileSync(new URL("../README_EN.md", import.meta.url), "utf8");

test("server version follows package.json version", () => {
    assert.equal(SERVER_VERSION, packageJson.version);
});

test("tool registry exposes consistent count", () => {
    assert.equal(toolCount, toolDefinitions.length);
    assert.ok(toolCount > 0);
});

test("README tool sections stay in sync with tool registry count", () => {
    const koToolSections = (readmeKo.match(/^### github_/gm) ?? []).length;
    const enToolSections = (readmeEn.match(/^### github_/gm) ?? []).length;

    assert.equal(koToolSections, toolCount);
    assert.equal(enToolSections, toolCount);
});

test("test-local script does not hardcode obsolete tool count", () => {
    assert.equal(testLocalScript.includes("9개가 보여야 함"), false);
});
