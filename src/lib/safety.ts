import { ToolValidationError } from "./errors.js";

export const CONFIRM_TOKEN_VALUE = "CONFIRM";

export function assertConfirmation(confirmToken: string | undefined, actionLabel: string): void {
    if (confirmToken !== CONFIRM_TOKEN_VALUE) {
        throw new ToolValidationError(
            `${actionLabel} requires confirm_token=\"${CONFIRM_TOKEN_VALUE}\". Use dry_run=true to preview without executing.`,
            400
        );
    }
}

export function assertExpectedValue(
    expectedValue: string | undefined,
    actualValue: string,
    valueName: string
): void {
    if (expectedValue && expectedValue !== actualValue) {
        throw new ToolValidationError(
            `${valueName} mismatch. expected=${expectedValue}, actual=${actualValue}`,
            409
        );
    }
}
