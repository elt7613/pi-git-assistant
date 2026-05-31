/**
 * Git Assistant Extension — Agent-Driven
 *
 * The LLM analyzes changes, decides branches, writes commit messages,
 * and crafts PR descriptions. The extension only executes.
 *
 * Commands:
 *   /git-commit [args]     — Agent analyzes session files, decides, commits
 *   /git-commit-all [args] — Agent analyzes all changes, decides, commits
 *
 * Optional args:
 *   "give pr description" / "pr description" — Include PR description
 *   "use branch <name>" / "use this branch <name>" — Force specific branch
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { clearRepoRootCache } from "./git.js";
import { executeCommit } from "./executor.js";
import { getCommitMode, triggerCommit } from "./commands.js";
import { handleToolResult, reconstructSessionFiles } from "./tracker.js";
import {
	requestApproval,
	isGateBlocked,
	getBlockedError,
	getPendingError,
	resetGate,
	isManualTriggerPending,
	setManualTriggerPending,
} from "./gate.js";

export default function (pi: ExtensionAPI) {
	// Track session file changes (persisted in session)
	// NOTE: use "tool_result" not "tool_execution_end" because only tool_result has event.input
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			await handleToolResult(pi, event, ctx);
		}
	});

	// Reconstruct tracking from session entries
	pi.on("session_start", async (_event, ctx) => {
		clearRepoRootCache();
		await reconstructSessionFiles(ctx, pi);
	});
	pi.on("session_tree", async (_event, ctx) => reconstructSessionFiles(ctx, pi));

	// Register the execution tool (LLM calls this after analyzing)
	pi.registerTool({
		name: "git_commit_execute",
		label: "Execute Git Commit",
		description: `Execute a git commit with the LLM's decided parameters. This tool is called by the LLM after analyzing changes.`,
		promptSnippet: "Execute a git commit with branch, message, and file decisions",
		promptGuidelines: [
			"Use git_commit_execute only after analyzing the git diff and branch context provided in the conversation.",
			"The branchAction must be 'stay', 'switch', or 'create' based on careful analysis.",
			"Protected branches (main/master/develop) must always use 'create'.",
			"Commit message must be imperative present tense and under 72 characters.",
			"filesToStage should include only the relevant files, not the entire repo.",
		],
		parameters: Type.Object({
			branchAction: Type.Union([
				Type.Literal("stay"),
				Type.Literal("switch"),
				Type.Literal("create"),
			]),
			branchName: Type.String({
				description: "Target branch name (kebab-case, prefixed feat/fix/docs/test/config)",
			}),
			commitMessage: Type.String({
				description: "Conventional commit message, imperative mood, under 72 chars",
			}),
			filesToStage: Type.Array(Type.String(), {
				description: "List of file paths to stage and commit",
			}),
			withPR: Type.Boolean({
				description: "Whether to generate a PR description",
			}),
			prDescription: Type.Optional(
				Type.String({
					description:
						"Full PR description markdown (Summary/What/Why/How/Testing/Changes/Commits/Merge Notes)",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx: ExtensionContext) {
			// Check if this execution was triggered by a manual command (/git-commit, /git-commit-all)
			const wasManual = isManualTriggerPending();
			setManualTriggerPending(false);

			if (!wasManual) {
				// Gate: block if user previously denied this session
				if (isGateBlocked()) {
					return getBlockedError();
				}

				// Gate: ask user for one-time approval
				const approved = await requestApproval(ctx);
				if (!approved) {
					// If still not blocked, it means a dialog was already active
					if (!isGateBlocked()) {
						return getPendingError();
					}
					return getBlockedError();
				}
			}

			onUpdate?.({
				content: [{ type: "text", text: `Executing: ${params.branchAction} → ${params.branchName}...` }],
			});

			const result = await executeCommit(pi, getCommitMode(), params);

			if (!result.ok) {
				return {
					content: [{ type: "text", text: `❌ ${result.error}` }],
					details: { success: false, error: result.error },
					isError: true,
				};
			}

			const lines = [
				`✅ Committed successfully`,
				`Branch : ${result.branch}`,
				`Commit : ${result.hash}`,
				`Message: ${result.message}`,
				`Files  : ${result.files.join(", ")}`,
			];
			if (result.prDescription) {
				lines.push(``, `--- PR Description ---`, `\`\`\`markdown`, result.prDescription, `\`\`\``);
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { success: true, branch: result.branch, hash: result.hash },
			};
		},
	});

	// Register commands that trigger LLM analysis
	pi.registerCommand("git-commit", {
		description: "Agent-driven commit of session files (LLM analyzes + decides)",
		handler: async (args, ctx) => triggerCommit(args, "session", pi, ctx),
	});

	pi.registerCommand("git-commit-all", {
		description: "Agent-driven commit of all changes (LLM analyzes + decides)",
		handler: async (args, ctx) => triggerCommit(args, "all", pi, ctx),
	});

	// Manual command to reset the gate (only via Command Palette / user action)
	pi.registerCommand("git-commit-reset-gate", {
		description: "Reset the git execution gate so the agent can prompt again",
		handler: async (_args, ctx) => {
			resetGate();
			ctx.ui.notify("Git execution gate reset. The agent will prompt again on next commit.", "info");
		},
	});
}
