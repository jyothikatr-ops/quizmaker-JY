import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
	ChoiceNotFoundError,
	InvalidMcqError,
	McqNotFoundError,
	createAttempt,
	createMcq,
	deleteMcq,
	getMcq,
	listAttempts,
	listMcqs,
	updateMcq,
} from "./mcq-service";

const CREATOR_ID = "user-ada";

const twoChoices = [
	{ text: "3", isCorrect: false },
	{ text: "4", isCorrect: true },
];

const addition = {
	name: "Addition warmup",
	question: "What is 2 + 2?",
	createdBy: CREATOR_ID,
	choices: twoChoices,
};

const { fakeDb, getCloudflareContextMock } = vi.hoisted(() => {
	type McqRow = {
		id: string;
		name: string;
		question: string;
		created_by: string;
		created_at: string;
		updated_at: string;
	};
	type ChoiceRow = {
		id: string;
		mcq_id: string;
		choice_text: string;
		is_correct: number;
		position: number;
	};
	type AttemptRow = {
		id: string;
		mcq_id: string;
		choice_id: string | null;
		is_correct: number;
		created_at: string;
	};

	const knownUserIds = new Set<string>();
	const mcqs = new Map<string, McqRow>();
	const choices = new Map<string, ChoiceRow>();
	const attempts = new Map<string, AttemptRow>();
	const statements: { sql: string; binds: unknown[] }[] = [];
	let firstCalls = 0;
	let clock = 0;
	let batchCalls = 0;

	function nextTimestamp(): string {
		clock += 1;
		return `2026-09-02 18:00:${String(clock).padStart(2, "0")}`;
	}

	function execute(sql: string, binds: unknown[]): Record<string, unknown>[] {
		if (/^\s*INSERT\s+INTO\s+mcqs\b/i.test(sql)) {
			const [id, name, question, created_by] = binds as string[];
			if (!knownUserIds.has(created_by)) {
				throw new Error("FOREIGN KEY constraint failed: mcqs.created_by");
			}
			const now = nextTimestamp();
			const row: McqRow = {
				id,
				name,
				question,
				created_by,
				created_at: now,
				updated_at: now,
			};
			mcqs.set(id, row);
			return /RETURNING/i.test(sql) ? [{ ...row }] : [];
		}

		if (/^\s*INSERT\s+INTO\s+mcq_choices\b/i.test(sql)) {
			const [id, mcq_id, choice_text, is_correct, position] = binds as [
				string,
				string,
				string,
				number,
				number,
			];
			if (!mcqs.has(mcq_id)) {
				throw new Error("FOREIGN KEY constraint failed: mcq_choices.mcq_id");
			}
			const row: ChoiceRow = {
				id,
				mcq_id,
				choice_text,
				is_correct: Number(is_correct),
				position: Number(position),
			};
			choices.set(id, row);
			return /RETURNING/i.test(sql) ? [{ ...row }] : [];
		}

		if (/^\s*INSERT\s+INTO\s+mcq_attempts\b/i.test(sql)) {
			const [id, mcq_id, choice_id, is_correct] = binds as [string, string, string, number];
			if (!mcqs.has(mcq_id)) {
				throw new Error("FOREIGN KEY constraint failed: mcq_attempts.mcq_id");
			}
			const row: AttemptRow = {
				id,
				mcq_id,
				choice_id,
				is_correct: Number(is_correct),
				created_at: nextTimestamp(),
			};
			attempts.set(id, row);
			return /RETURNING/i.test(sql) ? [{ ...row }] : [];
		}

		if (/^\s*SELECT\s+.+\s+FROM\s+mcqs\b/i.test(sql)) {
			const rows = [...mcqs.values()];
			const filtered = /WHERE\s+id\s*=/i.test(sql)
				? rows.filter((row) => row.id === binds[0])
				: rows;
			if (/ORDER BY\s+created_at\s+DESC/i.test(sql)) {
				filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
			}
			return filtered.map((row) => ({ ...row }));
		}

		if (/^\s*SELECT\s+.+\s+FROM\s+mcq_choices\b/i.test(sql)) {
			let rows = [...choices.values()];
			if (/WHERE\s+id\s*=\s*\?1\s+AND\s+mcq_id\s*=/i.test(sql)) {
				rows = rows.filter((row) => row.id === binds[0] && row.mcq_id === binds[1]);
			} else if (/WHERE\s+mcq_id\s*=/i.test(sql)) {
				rows = rows.filter((row) => row.mcq_id === binds[0]);
			} else if (/WHERE\s+id\s*=/i.test(sql)) {
				rows = rows.filter((row) => row.id === binds[0]);
			}
			if (/ORDER BY\s+position/i.test(sql)) {
				rows.sort((a, b) => a.position - b.position);
			}
			return rows.map((row) => ({ ...row }));
		}

		if (/^\s*SELECT\s+.+\s+FROM\s+mcq_attempts\b/i.test(sql)) {
			let rows = [...attempts.values()];
			if (/WHERE\s+mcq_id\s*=/i.test(sql)) {
				rows = rows.filter((row) => row.mcq_id === binds[0]);
			}
			if (/ORDER BY\s+created_at\s+DESC/i.test(sql)) {
				rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
			}
			return rows.map((row) => ({ ...row }));
		}

		if (/^\s*UPDATE\s+mcqs\b/i.test(sql)) {
			if (/created_by/i.test(sql)) {
				throw new Error("update must not change created_by");
			}
			const id = String(binds[binds.length - 1]);
			const existing = mcqs.get(id);
			if (!existing) {
				return [];
			}
			existing.name = String(binds[0]);
			existing.question = String(binds[1]);
			existing.updated_at = nextTimestamp();
			return /RETURNING/i.test(sql) ? [{ ...existing }] : [];
		}

		if (/^\s*DELETE\s+FROM\s+mcq_choices\b/i.test(sql)) {
			const mcqId = String(binds[0]);
			for (const [id, row] of [...choices.entries()]) {
				if (row.mcq_id === mcqId) {
					choices.delete(id);
					for (const attempt of attempts.values()) {
						if (attempt.choice_id === id) {
							attempt.choice_id = null;
						}
					}
				}
			}
			return [];
		}

		if (/^\s*DELETE\s+FROM\s+mcqs\b/i.test(sql)) {
			const id = String(binds[0]);
			for (const [choiceId, row] of [...choices.entries()]) {
				if (row.mcq_id === id) {
					choices.delete(choiceId);
				}
			}
			for (const [attemptId, row] of [...attempts.entries()]) {
				if (row.mcq_id === id) {
					attempts.delete(attemptId);
				}
			}
			mcqs.delete(id);
			return [];
		}

		if (/\busers\b/i.test(sql)) {
			throw new Error("mcq service must not query the users table");
		}

		throw new Error(`Unsupported SQL in fake D1: ${sql}`);
	}

	type Statement = {
		sql: string;
		binds: unknown[];
		bind: (...args: unknown[]) => Statement;
		run: () => Promise<{ success: true }>;
		all: () => Promise<{ results: Record<string, unknown>[] }>;
		first: () => Promise<never>;
	};

	function prepare(sql: string): Statement {
		const binds: unknown[] = [];
		const statement: Statement = {
			sql,
			binds,
			bind(...args: unknown[]) {
				binds.push(...args);
				return statement;
			},
			async run() {
				statements.push({ sql, binds: [...binds] });
				execute(sql, binds);
				return { success: true };
			},
			async all() {
				statements.push({ sql, binds: [...binds] });
				return { results: execute(sql, binds) };
			},
			async first() {
				firstCalls += 1;
				throw new Error("mcq service must use all().results, not first()");
			},
		};
		return statement;
	}

	const fakeDb = {
		mcqs,
		choices,
		attempts,
		statements,
		get lastSql() {
			return statements.at(-1)?.sql ?? "";
		},
		get firstCalls() {
			return firstCalls;
		},
		get batchCalls() {
			return batchCalls;
		},
		reset() {
			knownUserIds.clear();
			knownUserIds.add(CREATOR_ID);
			mcqs.clear();
			choices.clear();
			attempts.clear();
			statements.length = 0;
			firstCalls = 0;
			clock = 0;
			batchCalls = 0;
		},
		prepare,
		async batch(stmts: Statement[]) {
			batchCalls += 1;
			return stmts.map((statement) => {
				statements.push({ sql: statement.sql, binds: [...statement.binds] });
				return { results: execute(statement.sql, statement.binds) };
			});
		},
	};

	return {
		fakeDb,
		getCloudflareContextMock: vi.fn(async () => ({
			env: { DB: fakeDb },
		})),
	};
});

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: getCloudflareContextMock,
}));

beforeEach(() => {
	vi.clearAllMocks();
	fakeDb.reset();
	getCloudflareContextMock.mockResolvedValue({
		env: { DB: fakeDb },
	});
});

describe("createMcq", () => {
	it("writes the question and choices in one batch with numbered placeholders", async () => {
		const created = await createMcq(addition);

		expect(fakeDb.batchCalls).toBeGreaterThan(0);
		const inserts = fakeDb.statements.filter((statement) => /^\s*INSERT/i.test(statement.sql));
		expect(inserts.some((statement) => /INSERT INTO mcqs\b/i.test(statement.sql))).toBe(true);
		expect(inserts.some((statement) => /INSERT INTO mcq_choices\b/i.test(statement.sql))).toBe(
			true,
		);
		for (const insert of inserts) {
			expect(insert.sql).toMatch(/\?1/);
			expect(insert.sql).not.toContain(addition.name);
			expect(insert.sql).not.toContain(addition.createdBy);
		}
		const mcqInsert = inserts.find((statement) => /INSERT INTO mcqs\b/i.test(statement.sql));
		expect(mcqInsert?.binds).toEqual([
			expect.any(String),
			addition.name,
			addition.question,
			CREATOR_ID,
		]);
		expect(created.createdBy).toBe(CREATOR_ID);
		expect(created.choices).toHaveLength(2);
		expect(created.choices.map((choice) => choice.text)).toEqual(["3", "4"]);
		expect(created.choices.map((choice) => choice.position)).toEqual([1, 2]);
		expect(created.choices.filter((choice) => choice.isCorrect)).toHaveLength(1);
		expect(fakeDb.mcqs.size).toBe(1);
		expect(fakeDb.choices.size).toBe(2);
	});

	it("trims name, question, and choice text", async () => {
		const created = await createMcq({
			name: "  Addition warmup  ",
			question: "  What is 2 + 2?  ",
			createdBy: CREATOR_ID,
			choices: [
				{ text: "  3  ", isCorrect: false },
				{ text: "  4  ", isCorrect: true },
			],
		});

		expect(created.name).toBe("Addition warmup");
		expect(created.question).toBe("What is 2 + 2?");
		expect(created.choices.map((choice) => choice.text)).toEqual(["3", "4"]);
	});

	it("rejects empty name, question, or creator before touching D1", async () => {
		await expect(createMcq({ ...addition, name: "   " })).rejects.toMatchObject({
			name: "InvalidMcqError",
			message: "Name is required",
		});
		await expect(createMcq({ ...addition, question: "" })).rejects.toMatchObject({
			name: "InvalidMcqError",
			message: "Question is required",
		});
		await expect(createMcq({ ...addition, createdBy: "  " })).rejects.toMatchObject({
			name: "InvalidMcqError",
			message: "Creator is required",
		});
		expect(fakeDb.mcqs.size).toBe(0);
		expect(fakeDb.statements).toHaveLength(0);
	});

	it("rejects the wrong number of choices or the wrong number of correct answers", async () => {
		await expect(createMcq({ ...addition, choices: [twoChoices[0]!] })).rejects.toMatchObject({
			name: "InvalidMcqError",
			message: "A question must have between 2 and 6 choices",
		});
		await expect(
			createMcq({
				...addition,
				choices: [
					...twoChoices,
					{ text: "5", isCorrect: false },
					{ text: "6", isCorrect: false },
					{ text: "7", isCorrect: false },
					{ text: "8", isCorrect: false },
					{ text: "9", isCorrect: false },
				],
			}),
		).rejects.toBeInstanceOf(InvalidMcqError);
		await expect(
			createMcq({
				...addition,
				choices: [
					{ text: "3", isCorrect: false },
					{ text: "4", isCorrect: false },
				],
			}),
		).rejects.toMatchObject({
			name: "InvalidMcqError",
			message: "Exactly one choice must be marked correct",
		});
		await expect(
			createMcq({
				...addition,
				choices: [
					{ text: "3", isCorrect: true },
					{ text: "4", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(InvalidMcqError);
		expect(fakeDb.mcqs.size).toBe(0);
	});

	it("maps a created_by foreign-key failure to Creator not found", async () => {
		await expect(createMcq({ ...addition, createdBy: "missing-user" })).rejects.toMatchObject({
			name: "InvalidMcqError",
			message: "Creator not found",
		});
		expect(fakeDb.mcqs.size).toBe(0);
	});

	it("never queries the users table", async () => {
		await createMcq(addition);

		expect(fakeDb.statements.some((statement) => /\busers\b/i.test(statement.sql))).toBe(false);
	});
});

describe("listMcqs and getMcq", () => {
	it("lists newest first without choices and reads with all() not first()", async () => {
		const first = await createMcq(addition);
		const second = await createMcq({
			...addition,
			name: "Subtraction warmup",
			question: "What is 5 - 1?",
		});

		const listed = await listMcqs();

		expect(listed.map((item) => item.id)).toEqual([second.id, first.id]);
		expect(listed[0]).not.toHaveProperty("choices");
		expect(listed[0]?.name).toBe("Subtraction warmup");
		expect(fakeDb.firstCalls).toBe(0);
		expect(getCloudflareContext).toHaveBeenCalled();
	});

	it("returns null from getMcq when the id is missing", async () => {
		await expect(getMcq("missing")).resolves.toBeNull();
	});

	it("returns choices ordered by position", async () => {
		const created = await createMcq(addition);
		const found = await getMcq(created.id);

		expect(found?.choices.map((choice) => choice.position)).toEqual([1, 2]);
		expect(found?.choices[1]?.isCorrect).toBe(true);
	});
});

describe("updateMcq", () => {
	it("replaces name, question, and choices without changing created_by", async () => {
		const created = await createMcq(addition);

		const updated = await updateMcq(created.id, {
			name: "Multiplication warmup",
			question: "What is 3 x 3?",
			choices: [
				{ text: "6", isCorrect: false },
				{ text: "9", isCorrect: true },
				{ text: "12", isCorrect: false },
			],
		});

		expect(updated.id).toBe(created.id);
		expect(updated.createdBy).toBe(CREATOR_ID);
		expect(updated.name).toBe("Multiplication warmup");
		expect(updated.question).toBe("What is 3 x 3?");
		expect(updated.choices).toHaveLength(3);
		expect(updated.choices.map((choice) => choice.text)).toEqual(["6", "9", "12"]);
		expect(updated.updatedAt > created.updatedAt).toBe(true);
		expect(fakeDb.choices.size).toBe(3);
		expect(fakeDb.statements.some((statement) => /^\s*UPDATE\s+mcqs\b/i.test(statement.sql))).toBe(
			true,
		);
		expect(
			fakeDb.statements.some((statement) => /UPDATE\s+mcqs[\s\S]*created_by/i.test(statement.sql)),
		).toBe(false);
	});

	it("throws McqNotFoundError when the question does not exist", async () => {
		await expect(
			updateMcq("missing", {
				name: "Gone",
				question: "Gone?",
				choices: twoChoices,
			}),
		).rejects.toBeInstanceOf(McqNotFoundError);
	});
});

describe("deleteMcq", () => {
	it("removes the question and its choices", async () => {
		const created = await createMcq(addition);

		await deleteMcq(created.id);

		await expect(getMcq(created.id)).resolves.toBeNull();
		expect(fakeDb.mcqs.size).toBe(0);
		expect(fakeDb.choices.size).toBe(0);
	});

	it("throws McqNotFoundError when the question does not exist", async () => {
		await expect(deleteMcq("missing")).rejects.toBeInstanceOf(McqNotFoundError);
	});
});

describe("attempts", () => {
	it("records whether the selected choice was correct", async () => {
		const created = await createMcq(addition);
		const wrong = created.choices.find((choice) => !choice.isCorrect);
		const right = created.choices.find((choice) => choice.isCorrect);
		expect(wrong).toBeDefined();
		expect(right).toBeDefined();

		const incorrect = await createAttempt(created.id, wrong!.id);
		const correct = await createAttempt(created.id, right!.id);

		expect(incorrect.isCorrect).toBe(false);
		expect(incorrect.choiceId).toBe(wrong!.id);
		expect(correct.isCorrect).toBe(true);
		expect(correct.mcqId).toBe(created.id);

		const listed = await listAttempts(created.id);
		expect(listed.map((attempt) => attempt.id)).toEqual([correct.id, incorrect.id]);
	});

	it("does not trust a client-supplied correctness flag", async () => {
		const created = await createMcq(addition);
		const wrong = created.choices.find((choice) => !choice.isCorrect)!;

		const attempt = await createAttempt(created.id, wrong.id);

		expect(attempt.isCorrect).toBe(false);
		const insert = fakeDb.statements.find((statement) => /INSERT INTO mcq_attempts\b/i.test(statement.sql));
		expect(insert?.binds[3]).toBe(0);
	});

	it("throws ChoiceNotFoundError when the choice is missing or belongs to another question", async () => {
		const first = await createMcq(addition);
		const second = await createMcq({
			...addition,
			name: "Other",
			question: "Other prompt",
		});

		await expect(createAttempt(first.id, "missing-choice")).rejects.toBeInstanceOf(
			ChoiceNotFoundError,
		);
		await expect(createAttempt(first.id, second.choices[0]!.id)).rejects.toBeInstanceOf(
			ChoiceNotFoundError,
		);
	});

	it("throws McqNotFoundError when listing or attempting a missing question", async () => {
		await expect(createAttempt("missing", "choice")).rejects.toBeInstanceOf(McqNotFoundError);
		await expect(listAttempts("missing")).rejects.toBeInstanceOf(McqNotFoundError);
	});

	it("keeps the attempt snapshot after choices are replaced", async () => {
		const created = await createMcq(addition);
		const right = created.choices.find((choice) => choice.isCorrect)!;
		const attempt = await createAttempt(created.id, right.id);

		await updateMcq(created.id, {
			name: created.name,
			question: created.question,
			choices: [
				{ text: "10", isCorrect: false },
				{ text: "11", isCorrect: true },
			],
		});

		const listed = await listAttempts(created.id);
		expect(listed).toHaveLength(1);
		expect(listed[0]?.id).toBe(attempt.id);
		expect(listed[0]?.isCorrect).toBe(true);
		expect(listed[0]?.choiceId).toBeNull();
	});
});
