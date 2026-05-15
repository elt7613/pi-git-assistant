/**
 * Git context gathering — collects repo state for LLM analysis.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { git, parseBranchList } from "./git.js";
import { getSessionFiles } from "./tracker.js";
import type { GitContextResult } from "./types.js";

export async function gatherGitContext(pi: ExtensionAPI, mode: "session" | "all"): Promise<GitContextResult> {
	const [
		repoCheck,
		currentBranch,
		allBranches,
		status,
		diff,
		recentCommits,
	] = await Promise.all([
		git(pi, ["rev-parse", "--git-dir"]),
		git(pi, ["branch", "--show-current"]),
		git(pi, ["branch", "-a"]),
		git(pi, ["status", "--short"]),
		git(pi, ["diff"]),
		git(pi, ["log", "--oneline", "-20"]),
	]);

	if (repoCheck.code !== 0) {
		return { isRepo: false };
	}

	const changedFiles = status.stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => line.slice(3).trim());

	const trackedFiles = getSessionFiles();
	const filesToAnalyze = mode === "session"
		? changedFiles.filter((f) => trackedFiles.includes(f))
		: changedFiles;

	// Get per-file diffs for files we'll actually analyze (limit to 20)
	const fileDiffEntries = await Promise.all(
		filesToAnalyze.slice(0, 20).map(async (file) => {
			const { stdout } = await git(pi, ["diff", "--", file]);
			return [file, stdout.trim().slice(0, 5000)] as const;
		}),
	);
	const fileDiffs: Record<string, string> = {};
	for (const [file, diffText] of fileDiffEntries) {
		if (diffText) fileDiffs[file] = diffText;
	}

	return {
		isRepo: true,
		currentBranch: currentBranch.stdout.trim(),
		allBranches: parseBranchList(allBranches.stdout),
		changedFiles,
		trackedFiles,
		filesToAnalyze,
		fullDiff: diff.stdout.slice(0, 15000),
		fileDiffs,
		allRecentCommits: recentCommits.stdout.trim(),
	};
}
