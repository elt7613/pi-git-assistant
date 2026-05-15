/**
 * Tests for command argument parsing.
 */

import { describe, it, expect } from "vitest";
import { parseCommitArgs } from "../commands.js";

describe("parseCommitArgs", () => {
	it("detects PR description request", () => {
		const result = parseCommitArgs("give pr description");
		expect(result.wantPR).toBe(true);
		expect(result.forcedBranch).toBeUndefined();
	});

	it("detects forced branch", () => {
		const result = parseCommitArgs("use branch feat/auth");
		expect(result.wantPR).toBe(false);
		expect(result.forcedBranch).toBe("feat/auth");
	});

	it("detects 'use this branch' variant", () => {
		const result = parseCommitArgs("use this branch fix/login");
		expect(result.forcedBranch).toBe("fix/login");
	});

	it("handles combined args", () => {
		const result = parseCommitArgs("give pr description use branch feat/x");
		expect(result.wantPR).toBe(true);
		expect(result.forcedBranch).toBe("feat/x");
	});

	it("handles empty args", () => {
		const result = parseCommitArgs("");
		expect(result.wantPR).toBe(false);
		expect(result.forcedBranch).toBeUndefined();
	});
});
