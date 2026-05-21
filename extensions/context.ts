/**
 * Git context gathering — collects repo state for LLM analysis.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { git, parseBranchList, getRepoRoot } from "./git.js";
import { getSessionFiles } from "./tracker.js";
import type { GitContextResult } from "./types.js";

export function parsePorcelainStatus(stdout: string): { changedFiles: string[]; untrackedSet: Set<string> } {
	const entries = stdout.split("\0").filter(Boolean);
	const changedFiles: string[] = [];
	const untrackedSet = new Set<string>();

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry.length < 3) continue;
		const code = entry.substring(0, 2);
		const path = entry.substring(3);

		if (code[0] === "R" || code[0] === "C") {
			// Rename or copy: XY new_path\0old_path\0
			changedFiles.push(path);
			if (entries[i + 1] !== undefined) {
				i++; // consume originalPath
			}
		} else {
			changedFiles.push(path);
		}

		if (code === "??") {
			untrackedSet.add(path);
		}
	}

	return { changedFiles, untrackedSet };
}

export async function gatherGitContext(pi: ExtensionAPI, mode: "session" | "all"): Promise<GitContextResult> {
	const [
		repoCheck,
		currentBranch,
		allBranches,
		status,
		recentCommits,
	] = await Promise.all([
		git(pi, ["rev-parse", "--git-dir"]),
		git(pi, ["branch", "--show-current"]),
		git(pi, ["branch", "-a"]),
		git(pi, ["status", "--porcelain", "-z"]),
		git(pi, ["log", "--oneline", "-20"]),
	]);

	if (repoCheck.code !== 0) {
		return { isRepo: false };
	}

	const { changedFiles, untrackedSet } = parsePorcelainStatus(status.stdout);

	const trackedFiles = getSessionFiles();
	const filesToAnalyze = mode === "session"
		? changedFiles.filter((f) => trackedFiles.includes(f))
		: changedFiles;

	const repoRoot = await getRepoRoot(pi);

	// Get per-file diffs for files we'll actually analyze (limit to 20)
	const fileDiffEntries = await Promise.all(
		filesToAnalyze.slice(0, 20).map(async (file) => {
			if (untrackedSet.has(file)) {
				if (!repoRoot) return [file, ""] as const;
				try {
					const path = join(repoRoot, file);
					const info = await stat(path);
					if (info.size > 50_000) {
						return [file, `(New untracked file — ${info.size} bytes, too large to display)`] as const;
					}
					const content = await readFile(path, "utf-8");
					return [file, `(New untracked file)\n${content.slice(0, 5000)}`] as const;
				} catch {
					return [file, ""] as const;
				}
			} else {
				const { stdout } = await git(pi, ["diff", "HEAD", "--", file]);
				return [file, stdout.trim().slice(0, 5000)] as const;
			}
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
		fileDiffs,
		allRecentCommits: recentCommits.stdout.trim(),
	};
}
