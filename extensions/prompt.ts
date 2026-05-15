/**
 * Builds the LLM analysis prompt from gathered git context.
 */

import type { GitContext } from "./types.js";

export function buildAnalysisPrompt(
	ctx: GitContext,
	mode: "session" | "all",
	withPR: boolean,
	forcedBranch?: string,
): string {
	const filesSection =
		ctx.filesToAnalyze.length > 0
			? ctx.filesToAnalyze
					.map((f) => {
						const diffPreview = ctx.fileDiffs[f]
							? `\n\`\`\`diff\n${ctx.fileDiffs[f].slice(0, 800)}\n\`\`\``
							: "";
						return `- ${f}${diffPreview}`;
					})
					.join("\n")
			: "(no files to analyze)";

	return [
		`You are the git commit assistant. Analyze the following changes and call the \`git_commit_execute\` tool with your decisions.`,
		``,
		`--- GIT STATE ---`,
		`Current branch: ${ctx.currentBranch}`,
		`Mode: ${mode} ("session" = only files touched in this pi session; "all" = every uncommitted change)`,
		`Session-tracked files: ${ctx.trackedFiles.join(", ") || "none"}`,
		`Files to commit: ${ctx.filesToAnalyze.join(", ") || "none"}`,
		`All changed files in repo: ${ctx.changedFiles.join(", ") || "none"}`,
		`Existing branches: ${ctx.allBranches.join(", ")}`,
		forcedBranch ? `User requested branch: ${forcedBranch}` : "",
		``,
		`--- RECENT COMMIT HISTORY ---`,
		ctx.allRecentCommits,
		``,
		`--- DIFFS ---`,
		filesSection,
		ctx.filesToAnalyze.length > 20 ? `\n... and ${ctx.filesToAnalyze.length - 20} more files` : "",
		``,
		`--- YOUR TASK ---`,
		`1. Read the diffs and understand what the changes actually do.`,
		`2. Decide the best branch action:`,
		`   - "stay" — only if current branch CLEARLY matches this exact work`,
		`   - "switch" — an existing branch clearly matches better than current`,
		`   - "create" — no existing branch clearly matches, or current is main/master/develop`,
		`3. Pick or invent a good branch name (kebab-case, prefix with feat/fix/docs/test/config).`,
		`4. Write a conventional commit message under 72 chars (imperative mood: "add", "fix", "update").`,
		`5. List which files to stage.`,
		`6. Set withPR to ${withPR} (user ${withPR ? "requested" : "did not request"} a PR description).`,
		withPR
			? `7. Write a professional PR description using the template: Summary / What / Why / How / Testing checklist / Changes list / Commits list / Merge Notes.`
			: "",
		``,
		`STRICT RULES:`,
		`- main/master/develop → ALWAYS create new branch, never commit directly`,
		`- "Close enough" is NOT a match → create new branch`,
		`- When in doubt, ALWAYS create a new branch`,
		`- Current branch gets ZERO special treatment`,
		`- Commit message must be imperative present tense ("add auth", not "added auth")`,
		`- Branch name must describe the actual changes, not the session or date`,
	]
		.filter(Boolean)
		.join("\n");
}
