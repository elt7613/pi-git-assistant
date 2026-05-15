/**
 * Execution gate for autonomous git tool use.
 *
 * When the agent calls git_commit_execute, the user must explicitly approve
 * each attempt via a confirmation dialog. If the user selects "No", the gate
 * is locked for the remainder of the session and all subsequent attempts fail
 * immediately with a terminal error.
 *
 * Manual commands (/git-commit, /git-commit-all) do NOT pass through this gate;
 * they trigger LLM analysis, and only the resulting tool call is gated.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

let sessionBlocked = false;
let dialogActive = false;

/** Reset the gate so the next autonomous tool call will prompt again. */
export function resetGate(): void {
	sessionBlocked = false;
	dialogActive = false;
}

/** Check whether the gate is currently locked (user previously denied). */
export function isGateBlocked(): boolean {
	return sessionBlocked;
}

/**
 * Request user approval before executing an autonomous git operation.
 *
 * @returns `true` if the user approved this single execution.
 *          `false` if denied or dismissed — also sets sessionBlocked.
 */
export async function requestApproval(ctx: ExtensionContext): Promise<boolean> {
	if (sessionBlocked) {
		return false;
	}

	if (dialogActive) {
		// Another prompt is already waiting; tell the caller to back off.
		return false;
	}

	dialogActive = true;
	try {
		const approved = await ctx.ui.confirm(
			"Git Commit Request",
			"The AI assistant wants to execute a git commit. Allow this once?",
			{ modal: false }
		);

		if (!approved) {
			sessionBlocked = true;
		}

		return approved;
	} finally {
		dialogActive = false;
	}
}

/** Terminal error returned when the gate is locked. */
export function getBlockedError(): {
	content: Array<{ type: "text"; text: string }>;
	isError: true;
} {
	return {
		content: [
			{
				type: "text",
				text:
					"Autonomous git is disabled for this session. User denied permission. " +
					"Do not retry git_commit_execute. User must commit manually or reset the gate via Command Palette.",
			},
		],
		isError: true,
	};
}

/** Error returned when a previous dialog is still pending. */
export function getPendingError(): {
	content: Array<{ type: "text"; text: string }>;
	isError: true;
} {
	return {
		content: [
			{
				type: "text",
				text:
					"Previous git approval prompt is still pending. Wait for user response. " +
					"Do not retry immediately.",
			},
		],
		isError: true,
	};
}
