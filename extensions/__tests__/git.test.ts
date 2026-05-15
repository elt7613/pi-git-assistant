/**
 * Tests for git utility functions.
 */

import { describe, it, expect } from "vitest";
import { parseBranchList, toRepoRelative } from "../git.js";

describe("toRepoRelative", () => {
	it("returns relative path for files inside repo", () => {
		const result = toRepoRelative("/home/user/project/src/index.ts", "/home/user/project");
		expect(result).toBe("src/index.ts");
	});

	it("returns null for files outside repo", () => {
		const result = toRepoRelative("/home/other/file.ts", "/home/user/project");
		expect(result).toBeNull();
	});

	it("returns null for the repo root itself", () => {
		const result = toRepoRelative("/home/user/project", "/home/user/project");
		expect(result).toBeNull();
	});
});

describe("parseBranchList", () => {
	it("strips asterisk prefix from current branch", () => {
		const raw = "* main\n  feat/auth\n  fix/login";
		expect(parseBranchList(raw)).toEqual(["main", "feat/auth", "fix/login"]);
	});

	it("filters out remotes and HEAD refs", () => {
		const raw = "* main\n  remotes/origin/main\n  remotes/origin/HEAD -> origin/main\n  feat/x";
		expect(parseBranchList(raw)).toEqual(["main", "feat/x"]);
	});

	it("handles empty input", () => {
		expect(parseBranchList("")).toEqual([]);
	});
});
