import assert from "node:assert/strict";
import test from "node:test";

import { assertConfirmation, assertExpectedValue, CONFIRM_TOKEN_VALUE } from "../dist/lib/safety.js";

test("assertConfirmation accepts the expected confirmation token", () => {
    assert.doesNotThrow(() => {
        assertConfirmation(CONFIRM_TOKEN_VALUE, "merge");
    });
});

test("assertConfirmation rejects missing token", () => {
    assert.throws(() => {
        assertConfirmation(undefined, "merge");
    });
});

test("assertExpectedValue passes on equal values", () => {
    assert.doesNotThrow(() => {
        assertExpectedValue("abc", "abc", "sha");
    });
});

test("assertExpectedValue rejects mismatch", () => {
    assert.throws(() => {
        assertExpectedValue("abc", "def", "sha");
    });
});
