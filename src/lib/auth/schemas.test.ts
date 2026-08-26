import { loginBodySchema, registerBodySchema } from "./schemas";

const validHash = "a".repeat(64);

const validRegister = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
	passwordHash: validHash,
};

const validLogin = {
	username: "ada@school.edu",
	passwordHash: validHash,
};

describe("registerBodySchema", () => {
	it("accepts username equal to email and a 64-char hex passwordHash", () => {
		const result = registerBodySchema.safeParse(validRegister);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.username).toBe(result.data.email);
			expect(result.data.passwordHash).toHaveLength(64);
		}
	});

	it("rejects missing fields, invalid email, and a bad passwordHash", () => {
		expect(registerBodySchema.safeParse({ ...validRegister, firstName: "" }).success).toBe(
			false,
		);
		expect(registerBodySchema.safeParse({ ...validRegister, email: "not-an-email" }).success).toBe(
			false,
		);
		expect(registerBodySchema.safeParse({ ...validRegister, passwordHash: "abc" }).success).toBe(
			false,
		);
		expect(
			registerBodySchema.safeParse({ ...validRegister, passwordHash: "g".repeat(64) }).success,
		).toBe(false);
		expect(
			registerBodySchema.safeParse({ ...validRegister, passwordHash: "A".repeat(64) }).success,
		).toBe(false);

		expect(
			registerBodySchema.safeParse({
				lastName: validRegister.lastName,
				username: validRegister.username,
				email: validRegister.email,
				passwordHash: validRegister.passwordHash,
			}).success,
		).toBe(false);
	});

	it("does not accept a plaintext password field as a substitute for passwordHash", () => {
		expect(
			registerBodySchema.safeParse({
				firstName: validRegister.firstName,
				lastName: validRegister.lastName,
				username: validRegister.username,
				email: validRegister.email,
				password: "plaintext-secret",
			}).success,
		).toBe(false);
	});
});

describe("loginBodySchema", () => {
	it("requires username and a 64-char hex passwordHash", () => {
		expect(loginBodySchema.safeParse(validLogin).success).toBe(true);
		expect(loginBodySchema.safeParse({ username: "", passwordHash: validHash }).success).toBe(
			false,
		);
		expect(loginBodySchema.safeParse({ username: "ada", passwordHash: "abc" }).success).toBe(
			false,
		);
	});

	it("does not accept a plaintext password field as a substitute for passwordHash", () => {
		expect(
			loginBodySchema.safeParse({ username: "ada", password: "plaintext-secret" }).success,
		).toBe(false);
	});
});
