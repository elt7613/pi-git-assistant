/**
 * Git context gathering — collects repo state for LLM analysis.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { git } from "./git.js";
import { getSessionFiles } from "./tracker.js";
import type { GitContextResult } from "./types.js";

export async function gatherGitContext(pi: ExtensionAPI, mode: "session" | "all"): Promise<GitContextResult> {
	const [
		repoCheck,
		currentBranch,
		allBranches,
		status,
		diff,
		log,
		recentCommits,
	] = await Promise.all([
		git(pi, ["rev-parse", "--git-dir"]),
		git(pi, ["branch", "--show-current"]),
		git(pi, ["branch", "-a"]),
		git(pi, ["status", "--short"]),
		git(pi, ["diff"]),
		git(pi, ["log", "--oneline", "-5"]),
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
	const fileDiffs: Record<string, string> = {};
	for (const file of filesToAnalyze.slice(0, 20)) {
		const { stdout } = await git(pi, ["diff", "--", file]);
		if (stdout.trim()) fileDiffs[file] = stdout.slice(0, 5000);
	}

	return {
		isRepo: true,
		currentBranch: currentBranch.stdout.trim(),
		allBranches: allBranches.stdout
			.split("\n")
			.map((b) => b.trim().replace(/^\* /, ""))
			.filter((b) => b && !b.startsWith("remotes/") && !b.includes("HEAD")),
		changedFiles,
		trackedFiles,
		filesToAnalyze,
		fullDiff: diff.stdout.slice(0, 15000),
		fileDiffs,
		recentLog: log.stdout.trim(),
		allRecentCommits: recentCommits.stdout.trim(),
	};
}
