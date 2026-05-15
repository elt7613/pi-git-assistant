# pi-git-assistant

Agent-driven git commit assistant for [pi](https://pi.dev).

The LLM reads your diffs, understands the changes, decides the right branch, writes the commit message, and optionally crafts a professional PR description. The extension only executes — no hidden logic, no hardcoded heuristics.

## Install

Via npm (recommended):

```bash
pi install npm:git-assistant
```

Via git:

```bash
pi install git:github.com/elt7613/pi-git-assistant
```

Or from a local path:

```bash
pi install /path/to/git-assistant
```

## Commands

| Command | What it does |
|---------|-------------|
| `/git-commit` | Commit only files touched in this pi session |
| `/git-commit-all` | Commit all uncommitted changes |

### Optional arguments

```bash
/git-commit give pr description
/git-commit-all give pr description
/git-commit use branch feat/auth
/git-commit-all use branch fix/login
```

## How it works

1. **You type** `/git-commit` or `/git-commit-all`
2. **Extension gathers** git state: diffs, branches, file list, recent history
3. **LLM analyzes** the actual code changes and decides:
   - Branch action: stay / switch / create
   - Branch name (kebab-case, prefixed feat/fix/docs/test/config)
   - Commit message (imperative present tense, under 72 chars)
   - Which files to stage
   - PR description (if requested)
4. **LLM calls** `git_commit_execute` tool with its decisions
5. **Extension runs** the git commands and reports the result

## Strict branch rules (enforced in LLM prompt)

- `main` / `master` / `develop` → **always** create new branch
- Current branch gets **zero** special treatment
- "Close enough" is **not** a match → create new branch
- When in doubt, **always** create a new branch

## Session tracking

Files touched by `write` and `edit` tools during a pi session are automatically tracked. Tracking survives session resume — so `/git-commit` works even after you `/resume` a previous session.

## Safe git commands only

This extension only uses:
- `git status`, `git branch`, `git log`, `git diff`
- `git checkout`, `git add`, `git commit`

**Never uses:** stash, restore, reset, rebase, merge, cherry-pick, clean, pull, push.
