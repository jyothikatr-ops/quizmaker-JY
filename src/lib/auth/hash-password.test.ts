import { hashPassword } from "./hash-password";

describe("hashPassword", () => {
	it("returns a 64-character lowercase hex digest", async () => {
		const digest = await hashPassword("secret");

		expect(digest).toMatch(/^[0-9a-f]{64}$/);
		expect(digest).not.toBe("secret");
	});

	it("returns the same digest for the same plaintext", async () => {
		await expect(hashPassword("secret")).resolves.toBe(await hashPassword("secret"));
	});

	it("returns a different digest for different plaintext", async () => {
		const first = await hashPassword("secret");
		const second = await hashPassword("secret!");

		expect(first).not.toBe(second);
	});
});
