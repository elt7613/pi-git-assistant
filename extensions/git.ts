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
