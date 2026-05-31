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

	it("resolves relative paths against the supplied baseCwd", () => {
		const result = toRepoRelative("foo.ts", "/home/user/project", "/home/user/project/src");
		expect(result).toBe("src/foo.ts");
	});

	it("resolves dotted relative paths against baseCwd", () => {
		const result = toRepoRelative("./pkg/index.ts", "/home/user/project", "/home/user/project");
		expect(result).toBe("pkg/index.ts");
	});

	it("returns null when relative path resolves outside the repo", () => {
		const result = toRepoRelative("../other/file.ts", "/home/user/project", "/home/user/project");
		expect(result).toBeNull();
	});

	it("prefers absolute paths over baseCwd", () => {
		const result = toRepoRelative(
			"/home/user/project/src/a.ts",
			"/home/user/project",
			"/some/unrelated/cwd",
		);
		expect(result).toBe("src/a.ts");
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
