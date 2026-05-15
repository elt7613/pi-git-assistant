/**
 * Shared types for the git-assistant extension.
 */

export type CommitMode = "session" | "all";

export type BranchAction = "stay" | "switch" | "create";

export interface GitResult {
	stdout: string;
	stderr: string;
	code: number;
}

export interface CommitParams {
	branchAction: BranchAction;
	branchName: string;
	commitMessage: string;
	filesToStage: string[];
	withPR: boolean;
	prDescription?: string;
}

export interface ExecuteResult {
	ok: true;
	branch: string;
	hash: string;
	message: string;
	files: string[];
	prDescription?: string;
}

export interface ExecuteError {
	ok: false;
	error: string;
}

export interface GitContext {
	isRepo: true;
	currentBranch: string;
	allBranches: string[];
	changedFiles: string[];
	trackedFiles: string[];
	filesToAnalyze: string[];
	fullDiff: string;
	fileDiffs: Record<string, string>;
	recentLog: string;
	allRecentCommits: string;
}

export interface NotARepo {
	isRepo: false;
}

export type GitContextResult = GitContext | NotARepo;
