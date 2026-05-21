/**
 * Tests for commit execution and staging safety.
 */

import { describe, it, expect, vi } from "vitest";
import { executeCommit } from "../executor.js";

function makePi(
	overrides?: Record<string, { code: number; stdout: string; stderr: string }>,
) {
	return {
		exec: vi.fn(async (cmd: string, args: string[]) => {
			const key = `${cmd} ${args.join(" ")}`;
			if (overrides?.[key]) return overrides[key];

			// Default successful responses
			if (args.includes("branch") && args.includes("--show-current"))
				return { code: 0, stdout: "main\n", stderr: "" };
			if (args.includes("branch") && args.includes("-a"))
				return { code: 0, stdout: "* main\n", stderr: "" };
			if (args.includes("diff") && args.includes("--cached"))
				return { code: 0, stdout: " M file.ts\n", stderr: "" };
			if (args[0] === "commit")
				return { code: 0, stdout: "", stderr: "" };
			if (args.includes("log") && args.includes("--oneline"))
				return { code: 0, stdout: "abc123 init\n", stderr: "" };
			if (args.includes("symbolic-ref"))
				return { code: 1, stdout: "", stderr: "" };
			if (args.includes("rev-parse") && args.includes("--verify"))
				return { code: 0, stdout: "", stderr: "" };

			return { code: 0, stdout: "", stderr: "" };
		}),
	} as any;
}

describe("executeCommit staging safety", () => {
	it("returns error when a single file fails to stage", async () => {
		const pi = makePi({
			"git add bad-file.ts": {
				code: 1,
				stdout: "",
				stderr: "pathspec 'bad-file.ts' did not match",
			},
		});

		const result = await executeCommit(pi, "session", {
			branchAction: "stay",
			branchName: "main",
			commitMessage: "test",
			filesToStage: ["bad-file.ts"],
			withPR: false,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Failed to stage bad-file.ts");
		}
	});

	it("returns error when bulk staging fails in 'all' mode", async () => {
		const pi = makePi({
			"git add .": {
				code: 1,
				stdout: "",
				stderr: "Unable to create file lock",
			},
		});

		const result = await executeCommit(pi, "all", {
			branchAction: "stay",
			branchName: "main",
			commitMessage: "test",
			filesToStage: [],
			withPR: false,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Failed to stage files");
		}
	});
});
