import { attemptBodySchema, createMcqBodySchema, updateMcqBodySchema } from "./schemas";

const twoChoices = [
	{ text: "3", isCorrect: false },
	{ text: "4", isCorrect: true },
];

const validCreate = {
	name: "Addition warmup",
	question: "What is 2 + 2?",
	createdBy: "user-ada",
	choices: twoChoices,
};

const validUpdate = {
	name: "Addition warmup",
	question: "What is 2 + 2?",
	choices: twoChoices,
};

describe("createMcqBodySchema", () => {
	it("accepts a trimmed name, question, createdBy, and 2–6 choices with one correct", () => {
		const result = createMcqBodySchema.safeParse({
			...validCreate,
			name: "  Addition warmup  ",
			question: "  What is 2 + 2?  ",
			createdBy: "  user-ada  ",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(validCreate);
		}
	});

	it("rejects missing createdBy, empty fields, and the wrong number of correct choices", () => {
		expect(createMcqBodySchema.safeParse(validUpdate).success).toBe(false);
		expect(createMcqBodySchema.safeParse({ ...validCreate, name: "   " }).success).toBe(false);
		expect(createMcqBodySchema.safeParse({ ...validCreate, question: "" }).success).toBe(false);
		expect(createMcqBodySchema.safeParse({ ...validCreate, createdBy: "" }).success).toBe(false);
		expect(
			createMcqBodySchema.safeParse({ ...validCreate, choices: [twoChoices[0]] }).success,
		).toBe(false);
		expect(
			createMcqBodySchema.safeParse({
				...validCreate,
				choices: [
					{ text: "3", isCorrect: false },
					{ text: "4", isCorrect: false },
				],
			}).success,
		).toBe(false);
		expect(
			createMcqBodySchema.safeParse({
				...validCreate,
				choices: [
					{ text: "3", isCorrect: true },
					{ text: "4", isCorrect: true },
				],
			}).success,
		).toBe(false);
	});
});

describe("updateMcqBodySchema", () => {
	it("accepts name, question, and choices without createdBy", () => {
		const result = updateMcqBodySchema.safeParse(validUpdate);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual(validUpdate);
			expect(result.data).not.toHaveProperty("createdBy");
		}
	});

	it("ignores createdBy if the client sends it", () => {
		const result = updateMcqBodySchema.safeParse({
			...validUpdate,
			createdBy: "someone-else",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).not.toHaveProperty("createdBy");
		}
	});
});

describe("attemptBodySchema", () => {
	it("requires a non-empty choiceId", () => {
		expect(attemptBodySchema.safeParse({ choiceId: "choice-1" }).success).toBe(true);
		expect(attemptBodySchema.safeParse({ choiceId: "  " }).success).toBe(false);
		expect(attemptBodySchema.safeParse({}).success).toBe(false);
	});
});
