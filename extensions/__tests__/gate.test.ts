/**
 * Tests for the execution gate.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	resetGate,
	isGateBlocked,
	requestApproval,
	getBlockedError,
	getPendingError,
	setManualTriggerPending,
	isManualTriggerPending,
} from "../gate.js";

function makeCtx(approved: boolean) {
	return {
		ui: {
			confirm: async () => approved,
		},
	} as any;
}

describe("gate", () => {
	beforeEach(() => {
		resetGate();
	});

	it("starts unblocked", () => {
		expect(isGateBlocked()).toBe(false);
	});

	it("resetGate clears blocked state", async () => {
		await requestApproval(makeCtx(false));
		expect(isGateBlocked()).toBe(true);
		resetGate();
		expect(isGateBlocked()).toBe(false);
	});

	it("approval returns true and does not block", async () => {
		const approved = await requestApproval(makeCtx(true));
		expect(approved).toBe(true);
		expect(isGateBlocked()).toBe(false);
	});

	it("denial returns false and blocks session", async () => {
		const approved = await requestApproval(makeCtx(false));
		expect(approved).toBe(false);
		expect(isGateBlocked()).toBe(true);
	});

	it("subsequent calls return false immediately when blocked", async () => {
		await requestApproval(makeCtx(false));
		const approved = await requestApproval(makeCtx(true));
		expect(approved).toBe(false);
	});

	it("getBlockedError returns terminal error", () => {
		const err = getBlockedError();
		expect(err.isError).toBe(true);
		expect(err.content[0].text).toContain("Do not retry");
	});

	it("getPendingError returns retry deterrent", () => {
		const err = getPendingError();
		expect(err.isError).toBe(true);
		expect(err.content[0].text).toContain("Do not retry immediately");
	});

	it("manual trigger starts false", () => {
		expect(isManualTriggerPending()).toBe(false);
	});

	it("setManualTriggerPending toggles flag", () => {
		setManualTriggerPending(true);
		expect(isManualTriggerPending()).toBe(true);
		setManualTriggerPending(false);
		expect(isManualTriggerPending()).toBe(false);
	});

	it("resetGate clears manual trigger flag", () => {
		setManualTriggerPending(true);
		resetGate();
		expect(isManualTriggerPending()).toBe(false);
	});
});
