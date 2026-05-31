/**
 * Git command wrappers and repository utilities.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isAbsolute, relative, resolve } from "node:path";
import type { GitResult } from "./types.js";

let repoRootCache: string | null = null;

export async function getRepoRoot(pi: ExtensionAPI): Promise<string | null> {
	if (repoRootCache) return repoRootCache;
	const { stdout, code } = await pi.exec("git", ["rev-parse", "--show-toplevel"]);
	if (code !== 0) return null;
	repoRootCache = stdout.trim();
	return repoRootCache;
}

export function clearRepoRootCache(): void {
	repoRootCache = null;
}

/**
 * Map a path (absolute OR relative) to a repo-root-relative POSIX path.
 *
 * For relative inputs, resolve against `baseCwd` rather than `process.cwd()`.
 * The pi `write`/`edit` tools accept relative paths and resolve them via the
 * agent's cwd internally — so the extension must use the SAME cwd to round-trip
 * back to a stable repo-relative path. Falling back to `process.cwd()` matches
 * legacy behavior for callers that don't supply `baseCwd`.
 */
export function toRepoRelative(rawPath: string, repoRoot: string, baseCwd?: string): string | null {
	const absPath = isAbsolute(rawPath) ? rawPath : resolve(baseCwd ?? process.cwd(), rawPath);
	const rel = relative(repoRoot, absPath).replace(/\\/g, "/");
	if (rel.startsWith("..") || rel === "." || rel === "") return null;
	return rel;
}

export async function git(pi: ExtensionAPI, args: string[]): Promise<GitResult> {
	return pi.exec("git", args);
}

export function parseBranchList(raw: string): string[] {
	return raw
		.split("\n")
		.map((b) => b.trim().replace(/^\* /, ""))
		.filter((b) => b && !b.startsWith("remotes/") && !b.includes("HEAD"));
}

export async function getDefaultBranch(pi: ExtensionAPI): Promise<string> {
	// Try to resolve the default branch via origin/HEAD
	const { stdout, code } = await pi.exec("git", ["symbolic-ref", "refs/remotes/origin/HEAD"]);
	if (code === 0) {
		const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
		if (match) return match[1];
	}

	// Fallback: probe common default branch names
	for (const candidate of ["main", "master", "develop"]) {
		const { code } = await pi.exec("git", ["rev-parse", "--verify", candidate]);
		if (code === 0) return candidate;
	}

	// Last resort
	return "main";
}
