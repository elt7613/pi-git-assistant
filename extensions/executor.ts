/**
 * Commit execution logic.
 *
 * Applies LLM decisions: branch switch/create, stage files, commit.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { git, getDefaultBranch, parseBranchList } from "./git.js";
import type { CommitParams, ExecuteError, ExecuteResult } from "./types.js";

export async function executeCommit(
	pi: ExtensionAPI,
	mode: "session" | "all",
	params: CommitParams,
): Promise<ExecuteResult | ExecuteError> {
	const currentBranch = (await git(pi, ["branch", "--show-current"])).stdout.trim();
	const allBranchesRaw = (await git(pi, ["branch", "-a"])).stdout;
	const allBranches = parseBranchList(allBranchesRaw);

	let targetBranch = params.branchName;

	// Apply branch decision
	if (params.branchAction === "create") {
		const exists = allBranches.includes(targetBranch);
		if (exists) targetBranch = `${targetBranch}-2`;
		const { code, stderr } = await git(pi, ["checkout", "-b", targetBranch]);
		if (code !== 0) {
			return { ok: false, error: `Failed to create branch: ${stderr}` };
		}
	} else if (params.branchAction === "switch") {
		const { code, stderr } = await git(pi, ["checkout", targetBranch]);
		if (code !== 0) {
			return { ok: false, error: `Failed to switch branch: ${stderr}` };
		}
	}

	// Stage files
	// /git-commit-all ALWAYS uses "git add ." regardless of what LLM listed
	// /git-commit uses individual file adds from LLM's selection
	if (mode === "all") {
		const { code, stderr } = await git(pi, ["add", "."]);
		if (code !== 0) {
			return { ok: false, error: `Failed to stage files: ${stderr}` };
		}
	} else {
		for (const file of params.filesToStage) {
			const { code, stderr } = await git(pi, ["add", file]);
			if (code !== 0) {
				return { ok: false, error: `Failed to stage ${file}: ${stderr}` };
			}
		}
	}

	// Verify staged
	const staged = await git(pi, ["diff", "--cached", "--stat"]);
	if (staged.stdout.trim().length === 0) {
		return { ok: false, error: "Nothing staged to commit" };
	}

	// Commit
	const { code: commitCode, stderr: commitErr } = await git(pi, [
		"commit",
		"-m",
		params.commitMessage,
	]);
	if (commitCode !== 0) {
		return { ok: false, error: `Commit failed: ${commitErr}` };
	}

	const finalBranch = (await git(pi, ["branch", "--show-current"])).stdout.trim();
	const shortHash = (await git(pi, ["log", "--oneline", "-1"])).stdout
		.trim()
		.split(" ")[0];

	let prDesc: string | undefined;
	if (params.withPR) {
		prDesc = params.prDescription;
		if (!prDesc) {
			// Fallback template if LLM didn't provide one
			const baseBranch = await getDefaultBranch(pi);
			const commits = (await git(pi, ["log", `${baseBranch}..HEAD`, "--oneline"])).stdout.trim();
			prDesc = generateFallbackPR(params.commitMessage, params.filesToStage, commits, finalBranch, baseBranch);
		}
	}

	return {
		ok: true,
		branch: finalBranch,
		hash: shortHash,
		message: params.commitMessage,
		files: params.filesToStage,
		prDescription: prDesc,
	};
}

function generateFallbackPR(
	commitMsg: string,
	files: string[],
	commits: string,
	branchName: string,
	baseBranch: string,
): string {
	const commitList = commits
		.split("\n")
		.filter(Boolean)
		.map((l) => `- ${l.trim()}`)
		.join("\n");
	const changesList = files.map((f) => `- \`${f}\``).join("\n");
	return [
		`## Summary`,
		`${commitMsg}`,
		``,
		`## What`,
		`Changes to ${files.length} file(s).`,
		``,
		`## Why`,
		`Addresses the requirements for this feature/fix on branch \`${branchName}\`.`,
		``,
		`## How`,
		`See diff for implementation details.`,
		``,
		`## Testing`,
		`- [ ] Changes tested locally`,
		`- [ ] Existing tests pass`,
		`- [ ] No regressions introduced`,
		``,
		`## Changes`,
		changesList,
		``,
		`## Commits`,
		commitList || `- ${commitMsg}`,
		``,
		`## Merge Notes`,
		`- Target: \`${baseBranch}\``,
		`- Source: \`${branchName}\``,
	].join("\n");
}
