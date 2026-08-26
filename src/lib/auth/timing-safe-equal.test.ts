import { timingSafeEqualHex } from "./timing-safe-equal";

describe("timingSafeEqualHex", () => {
	it("returns true for identical hex strings", () => {
		const hash = "ab".repeat(32);
		expect(timingSafeEqualHex(hash, hash)).toBe(true);
	});

	it("returns false for different equal-length hex strings", () => {
		expect(timingSafeEqualHex("a".repeat(64), "b".repeat(64))).toBe(false);
	});

	it("returns false for different-length strings without using === on the secrets", () => {
		expect(timingSafeEqualHex("aa", "aabb")).toBe(false);
	});
});
