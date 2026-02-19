import assert from "node:assert/strict";
import test from "node:test";

import { buildRepositorySearchQuery, normalizeSearchSort } from "../dist/lib/search.js";

test("buildRepositorySearchQuery includes repo, type, state, labels, and qualifiers", () => {
    const query = buildRepositorySearchQuery({
        owner: "octo",
        repo: "hello",
        kind: "issue",
        state: "open",
        query: "memory leak",
        labels: ["bug", "urgent"],
        qualifiers: ["author:alice", "is:unmerged"],
    });

    assert.equal(
        query,
        'memory leak repo:octo/hello is:issue is:open label:"bug" label:"urgent" author:alice is:unmerged'
    );
});

test("normalizeSearchSort maps legacy values and best-match", () => {
    assert.equal(normalizeSearchSort("best-match"), undefined);
    assert.equal(normalizeSearchSort("popularity"), "comments");
    assert.equal(normalizeSearchSort("long-running"), "updated");
    assert.equal(normalizeSearchSort("created"), "created");
});
