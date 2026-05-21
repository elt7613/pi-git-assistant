/**
 * Tests for porcelain status parsing and session isolation.
 */

import { describe, it, expect } from "vitest";
import { parsePorcelainStatus } from "../context.js";

describe("parsePorcelainStatus", () => {
	it("parses modified and untracked files", () => {
		const input = "M  src/index.ts\0?? new-file.txt\0";
		const result = parsePorcelainStatus(input);
		expect(result.changedFiles).toEqual(["src/index.ts", "new-file.txt"]);
		expect(result.untrackedSet.has("new-file.txt")).toBe(true);
		expect(result.untrackedSet.has("src/index.ts")).toBe(false);
	});

	it("parses files with spaces without quotes", () => {
		const input = "M  my file.ts\0";
		const result = parsePorcelainStatus(input);
		expect(result.changedFiles).toEqual(["my file.ts"]);
	});

	it("parses renames taking the destination path", () => {
		const input = "R  new.txt\0old.txt\0";
		const result = parsePorcelainStatus(input);
		expect(result.changedFiles).toEqual(["new.txt"]);
	});

	it("parses renamed-and-modified files", () => {
		const input = "RM new.txt\0old.txt\0";
		const result = parsePorcelainStatus(input);
		expect(result.changedFiles).toEqual(["new.txt"]);
	});

	it("returns empty arrays for empty input", () => {
		const result = parsePorcelainStatus("");
		expect(result.changedFiles).toEqual([]);
		expect(result.untrackedSet.size).toBe(0);
	});

	it("still captures rename destination when original path is missing", () => {
		const input = "R  new.txt\0";
		const result = parsePorcelainStatus(input);
		expect(result.changedFiles).toEqual(["new.txt"]);
	});
});
