/**
 * Tests for session file tracking and reconstruction.
 *
 * Covers:
 *  - reconstruction from custom `git-file-track` entries
 *  - fallback reconstruction from assistant `toolCall` blocks (the late-install
 *    case where the extension was activated mid-session)
 *  - relative path resolution via the agent cwd from the session header
 *  - dedup so the same path isn't appended on every edit
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearRepoRootCache } from "../git.js";
import {
	getSessionFiles,
	handleToolResult,
	reconstructSessionFiles,
} from "../tracker.js";

const REPO_ROOT = "/home/user/project";

function makePi(opts: { execImpl?: (args: string[]) => { stdout: string; stderr: string; code: number } } = {}) {
	const appendEntry = vi.fn();
	const exec = vi.fn(async (_cmd: string, args: string[]) => {
		if (opts.execImpl) return opts.execImpl(args);
		// Default: claim repo root resolution succeeds.
		if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
			return { stdout: `${REPO_ROOT}\n`, stderr: "", code: 0 };
		}
		return { stdout: "", stderr: "", code: 0 };
	});
	return { exec, appendEntry } as any;
}

function makeCtx(entries: any[]) {
	return {
		sessionManager: {
			getEntries: () => entries,
		},
	} as any;
}

beforeEach(() => {
	clearRepoRootCache();
});

describe("reconstructSessionFiles", () => {
	it("rebuilds the tracked set from custom git-file-track entries", async () => {
		const ctx = makeCtx([
			{ type: "session", cwd: REPO_ROOT },
			{ type: "custom", customType: "git-file-track", data: { path: "src/a.ts" } },
			{ type: "custom", customType: "git-file-track", data: { path: "src/b.ts" } },
			{ type: "custom", customType: "unrelated", data: { path: "should-be-ignored.ts" } },
		]);
		const pi = makePi();

		await reconstructSessionFiles(ctx, pi);

		expect(getSessionFiles().sort()).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("falls back to scanning assistant tool calls when no custom entries exist (late-install case)", async () => {
		const ctx = makeCtx([
			{ type: "session", cwd: REPO_ROOT },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "writing files" },
						{
							type: "toolCall",
							name: "write",
							arguments: { path: `${REPO_ROOT}/src/feature.ts` },
						},
						{
							type: "toolCall",
							name: "edit",
							arguments: { path: `${REPO_ROOT}/README.md` },
						},
					],
				},
			},
		]);
		const pi = makePi();

		await reconstructSessionFiles(ctx, pi);

		expect(getSessionFiles().sort()).toEqual(["README.md", "src/feature.ts"]);
	});

	it("resolves relative paths from tool calls against the session-header cwd", async () => {
		const ctx = makeCtx([
			// Agent was launched from a subdirectory of the repo.
			{ type: "session", cwd: `${REPO_ROOT}/src` },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", name: "edit", arguments: { path: "feature.ts" } },
						{ type: "toolCall", name: "edit", arguments: { path: "./util.ts" } },
					],
				},
			},
		]);
		const pi = makePi();

		await reconstructSessionFiles(ctx, pi);

		// `feature.ts` and `./util.ts` resolve under /home/user/project/src
		expect(getSessionFiles().sort()).toEqual(["src/feature.ts", "src/util.ts"]);
	});

	it("ignores tool calls whose paths resolve outside the repo", async () => {
		const ctx = makeCtx([
			{ type: "session", cwd: REPO_ROOT },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", name: "write", arguments: { path: "/etc/passwd" } },
						{ type: "toolCall", name: "write", arguments: { path: "../sibling.ts" } },
					],
				},
			},
		]);
		const pi = makePi();

		await reconstructSessionFiles(ctx, pi);

		expect(getSessionFiles()).toEqual([]);
	});

	it("merges custom entries and message-scan fallback without duplicates", async () => {
		const ctx = makeCtx([
			{ type: "session", cwd: REPO_ROOT },
			{ type: "custom", customType: "git-file-track", data: { path: "src/a.ts" } },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{
							type: "toolCall",
							name: "write",
							arguments: { path: `${REPO_ROOT}/src/a.ts` },
						},
						{
							type: "toolCall",
							name: "edit",
							arguments: { path: `${REPO_ROOT}/src/b.ts` },
						},
					],
				},
			},
		]);
		const pi = makePi();

		await reconstructSessionFiles(ctx, pi);

		expect(getSessionFiles().sort()).toEqual(["src/a.ts", "src/b.ts"]);
	});
});

describe("handleToolResult", () => {
	it("appends a tracking entry once per file path (dedup)", async () => {
		// Start clean.
		await reconstructSessionFiles(makeCtx([]), makePi());

		const pi = makePi();
		const ctx = makeCtx([{ type: "session", cwd: REPO_ROOT }]);

		// Three edits to the same file.
		for (let i = 0; i < 3; i++) {
			await handleToolResult(
				pi,
				{ toolName: "edit", input: { path: `${REPO_ROOT}/src/a.ts` } },
				ctx,
			);
		}

		expect(pi.appendEntry).toHaveBeenCalledTimes(1);
		expect(pi.appendEntry).toHaveBeenCalledWith("git-file-track", { path: "src/a.ts" });
		expect(getSessionFiles()).toEqual(["src/a.ts"]);
	});

	it("appends separate entries for distinct files", async () => {
		await reconstructSessionFiles(makeCtx([]), makePi());

		const pi = makePi();
		const ctx = makeCtx([{ type: "session", cwd: REPO_ROOT }]);

		await handleToolResult(pi, { toolName: "write", input: { path: `${REPO_ROOT}/a.ts` } }, ctx);
		await handleToolResult(pi, { toolName: "edit", input: { path: `${REPO_ROOT}/b.ts` } }, ctx);

		expect(pi.appendEntry).toHaveBeenCalledTimes(2);
		expect(getSessionFiles().sort()).toEqual(["a.ts", "b.ts"]);
	});

	it("ignores tool results without a path", async () => {
		await reconstructSessionFiles(makeCtx([]), makePi());

		const pi = makePi();
		const ctx = makeCtx([{ type: "session", cwd: REPO_ROOT }]);

		await handleToolResult(pi, { toolName: "edit", input: {} }, ctx);
		await handleToolResult(pi, { toolName: "write" } as any, ctx);

		expect(pi.appendEntry).not.toHaveBeenCalled();
		expect(getSessionFiles()).toEqual([]);
	});

	it("retries repo-root resolution once when the first call fails", async () => {
		await reconstructSessionFiles(makeCtx([]), makePi());
		// The setup call cached the repo root via the default makePi(); clear it
		// so the failing-then-succeeding mock below actually gets invoked.
		clearRepoRootCache();

		let calls = 0;
		const pi = makePi({
			execImpl: (args) => {
				if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
					calls++;
					if (calls === 1) return { stdout: "", stderr: "fail", code: 1 };
					return { stdout: `${REPO_ROOT}\n`, stderr: "", code: 0 };
				}
				return { stdout: "", stderr: "", code: 0 };
			},
		});
		const ctx = makeCtx([{ type: "session", cwd: REPO_ROOT }]);

		await handleToolResult(
			pi,
			{ toolName: "edit", input: { path: `${REPO_ROOT}/src/x.ts` } },
			ctx,
		);

		expect(calls).toBe(2);
		expect(getSessionFiles()).toEqual(["src/x.ts"]);
	});
});
