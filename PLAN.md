# Plan: Fix Session Isolation & Execution Reliability

## Context

Fix four concrete reliability issues in the `pi-git-assistant` extension that break session isolation, produce empty diffs, corrupt file paths, and silently drop staging errors.

## Files to Modify

- `extensions/types.ts`
- `extensions/context.ts`
- `extensions/prompt.ts`
- `extensions/executor.ts`

## Reuse

- `getSessionFiles()` from `tracker.ts` — already isolates session-scoped files.
- `toRepoRelative()` from `git.ts` — already handles path relativisation.
- `parseBranchList()` from `git.ts` — already handles branch formatting.

## Approach

1. **Delete `fullDiff`** from `GitContext` and from the prompt so the LLM never sees cross-session changes.
2. **Replace `git status --short`** parsing with `git status --porcelain -z` parsing to correctly extract filenames including spaces, quotes, and renames.
3. **Replace `git diff -- <file>`** with `git diff HEAD -- <file>` for tracked files; for untracked files (`??` status), read file contents directly via `fs.readFile` instead of using `git diff`.
4. **Harden `executeCommit`** so each `git add` is checked: on non-zero exit, abort immediately and return an `ExecuteError`.

## Steps

- [ ] Step 1 — `extensions/types.ts`  
  Remove `fullDiff: string` from the `GitContext` interface.

- [ ] Step 2 — `extensions/context.ts`  
  - Swap `git status --short` for `git status --porcelain -z`.  
  - Parse null-terminated lines to extract clean file paths, handling renames by taking the destination path.  
  - Remove the `git diff` (global full-diff) call.  
  - For each file in `filesToAnalyze`, run `git diff HEAD -- <file>` to capture staged + unstaged changes.  
  - If a file is untracked (`??`), read its contents directly with `fs.readFile` instead of using `git diff`.  
  - Build `fileDiffs` only from the above per-file results.  

- [ ] Step 3 — `extensions/prompt.ts`  
  Remove the `fullDiff` field from the prompt string; keep only the per-file diff section (`filesSection`).

- [ ] Step 4 — `extensions/executor.ts`  
  In the staging loop (`for (const file of params.filesToStage)`), check the exit `code` after each `git add` call. If `code !== 0`, immediately return `{ ok: false, error: \`Failed to stage ${file}: ${stderr}\` }`.

- [ ] Step 5 — Update tests  
  Add/update tests in `__tests__/` to cover:  
  - Untracked files appearing in `filesToAnalyze`.  
  - Quoted file paths and renames parsing correctly.  
  - Staging failure returning an error instead of proceeding.

## Verification

- Run `npm test` (vitest) to confirm no regressions in existing tests.  
- Manually verify in a test repo: create two parallel sessions with separate file changes; confirm each `/git-commit` only diffs its own session files.  
- Verify that creating a new untracked file in a session shows its contents (not an empty diff) in the LLM context.
