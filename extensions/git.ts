/**
 * Git command wrappers and repository utilities.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { relative } from "node:path";
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

export function toRepoRelative(absPath: string, repoRoot: string): string | null {
	const rel = relative(repoRoot, absPath).replace(/\\/g, "/");
	if (rel.startsWith("..") || rel === ".") return null;
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
