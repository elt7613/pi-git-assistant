/**
 * Command handlers for /git-commit and /git-commit-all.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { gatherGitContext } from "./context.js";
import { buildAnalysisPrompt } from "./prompt.js";

let currentCommitMode: "session" | "all" = "session";

export function getCommitMode(): "session" | "all" {
	return currentCommitMode;
}

export function setCommitMode(mode: "session" | "all"): void {
	currentCommitMode = mode;
}

export interface ParsedArgs {
	wantPR: boolean;
	forcedBranch?: string;
}

export function parseCommitArgs(args: string): ParsedArgs {
	const wantPR =
		args.toLowerCase().includes("give pr description") ||
		args.toLowerCase().includes("pr description");
	const branchMatch = args.match(/use\s+(?:this\s+)?branch\s+(.+)/i);
	const forcedBranch = branchMatch ? branchMatch[1].trim() : undefined;
	return { wantPR, forcedBranch };
}

export async function triggerCommit(
	args: string,
	mode: "session" | "all",
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	const { wantPR, forcedBranch } = parseCommitArgs(args);

	ctx.ui.notify("Gathering git context for AI analysis...", "info");

	const gitCtx = await gatherGitContext(pi, mode);

	if (!gitCtx.isRepo) {
		ctx.ui.notify("Not a git repository", "error");
		return;
	}

	if (gitCtx.filesToAnalyze.length === 0) {
		const msg =
			mode === "session"
				? "No session-tracked files have uncommitted changes. Use /git-commit-all for everything."
				: "No uncommitted changes.";
		ctx.ui.notify(msg, "info");
		return;
	}

	const prompt = buildAnalysisPrompt(gitCtx, mode, wantPR, forcedBranch);

	ctx.ui.notify(`Analyzing ${gitCtx.filesToAnalyze.length} file(s) with AI...`, "info");

	// Set mode so the tool handler knows whether to use "git add ." or individual adds
	setCommitMode(mode);

	// Send to LLM for analysis — it will read the context and call git_commit_execute
	await pi.sendUserMessage(prompt, { triggerTurn: true });
}
