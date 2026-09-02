import { getCloudflareContext } from "@opennextjs/cloudflare";

export type McqListItem = {
	id: string;
	name: string;
	question: string;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

export type McqChoice = {
	id: string;
	text: string;
	isCorrect: boolean;
	position: number;
};

export type McqWithChoices = McqListItem & {
	choices: McqChoice[];
};

export type CreateMcqChoiceInput = {
	text: string;
	isCorrect: boolean;
};

export type CreateMcqInput = {
	name: string;
	question: string;
	createdBy: string;
	choices: CreateMcqChoiceInput[];
};

export type UpdateMcqInput = {
	name: string;
	question: string;
	choices: CreateMcqChoiceInput[];
};

export type McqAttempt = {
	id: string;
	mcqId: string;
	choiceId: string | null;
	isCorrect: boolean;
	createdAt: string;
};

export type CreateAttemptInput = {
	mcqId: string;
	choiceId: string;
};

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

type NormalizedChoice = {
	text: string;
	isCorrect: boolean;
	position: number;
};

export class McqNotFoundError extends Error {
	constructor(message = "Question not found") {
		super(message);
		this.name = "McqNotFoundError";
	}
}

export class ChoiceNotFoundError extends Error {
	constructor(message = "Choice not found") {
		super(message);
		this.name = "ChoiceNotFoundError";
	}
}

export class InvalidMcqError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidMcqError";
	}
}

async function getDb() {
	const { env } = await getCloudflareContext({ async: true });
	return env.DB;
}

function errorText(error: unknown): string {
	const parts: string[] = [];
	if (error instanceof Error) {
		parts.push(error.message);
		if (error.cause instanceof Error) {
			parts.push(error.cause.message);
		}
	} else {
		parts.push(String(error));
	}
	return parts.join(" ");
}

function isForeignKeyError(error: unknown): boolean {
	return /FOREIGN KEY constraint failed/i.test(errorText(error));
}

async function queryAll<T>(sql: string, binds: unknown[]): Promise<T[]> {
	const db = await getDb();
	const result = await db.prepare(sql).bind(...binds).all<T>();
	return result.results;
}

function toListItem(row: McqRow): McqListItem {
	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toChoice(row: ChoiceRow): McqChoice {
	return {
		id: row.id,
		text: row.choice_text,
		isCorrect: row.is_correct === 1,
		position: row.position,
	};
}

function toAttempt(row: AttemptRow): McqAttempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}

function requiredText(value: string, message: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new InvalidMcqError(message);
	}
	return trimmed;
}

function normalizeChoices(choices: CreateMcqChoiceInput[]): NormalizedChoice[] {
	if (choices.length < 2 || choices.length > 6) {
		throw new InvalidMcqError("A question must have between 2 and 6 choices");
	}

	const normalized = choices.map((choice, index) => ({
		text: requiredText(choice.text, "Each choice needs text."),
		isCorrect: Boolean(choice.isCorrect),
		position: index + 1,
	}));

	if (normalized.filter((choice) => choice.isCorrect).length !== 1) {
		throw new InvalidMcqError("Exactly one choice must be marked correct");
	}

	return normalized;
}

function validateMcqFields(name: string, question: string, choices: CreateMcqChoiceInput[]) {
	return {
		name: requiredText(name, "Name is required"),
		question: requiredText(question, "Question is required"),
		choices: normalizeChoices(choices),
	};
}

async function requireMcq(id: string): Promise<McqRow> {
	const rows = await queryAll<McqRow>(
		"SELECT id, name, question, created_by, created_at, updated_at FROM mcqs WHERE id = ?1",
		[id],
	);
	const row = rows[0];
	if (!row) {
		throw new McqNotFoundError();
	}
	return row;
}

async function loadChoices(mcqId: string): Promise<McqChoice[]> {
	const rows = await queryAll<ChoiceRow>(
		"SELECT id, choice_text, is_correct, position FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC",
		[mcqId],
	);
	return rows.map(toChoice);
}

async function loadMcqWithChoices(id: string): Promise<McqWithChoices | null> {
	const rows = await queryAll<McqRow>(
		"SELECT id, name, question, created_by, created_at, updated_at FROM mcqs WHERE id = ?1",
		[id],
	);
	const row = rows[0];
	if (!row) {
		return null;
	}
	return {
		...toListItem(row),
		choices: await loadChoices(id),
	};
}

function choiceInserts(
	db: D1Database,
	mcqId: string,
	choices: NormalizedChoice[],
) {
	return choices.map((choice) =>
		db
			.prepare(
				"INSERT INTO mcq_choices (id, mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
			)
			.bind(crypto.randomUUID(), mcqId, choice.text, choice.isCorrect ? 1 : 0, choice.position),
	);
}

export async function listMcqs(): Promise<McqListItem[]> {
	const rows = await queryAll<McqRow>(
		"SELECT id, name, question, created_by, created_at, updated_at FROM mcqs ORDER BY created_at DESC",
		[],
	);
	return rows.map(toListItem);
}

export async function getMcq(id: string): Promise<McqWithChoices | null> {
	return loadMcqWithChoices(id);
}

export async function createMcq(input: CreateMcqInput): Promise<McqWithChoices> {
	const createdBy = requiredText(input.createdBy, "Creator is required");
	const fields = validateMcqFields(input.name, input.question, input.choices);
	const mcqId = crypto.randomUUID();
	const db = await getDb();

	try {
		await db.batch([
			db
				.prepare("INSERT INTO mcqs (id, name, question, created_by) VALUES (?1, ?2, ?3, ?4)")
				.bind(mcqId, fields.name, fields.question, createdBy),
			...choiceInserts(db, mcqId, fields.choices),
		]);
	} catch (error) {
		if (isForeignKeyError(error)) {
			throw new InvalidMcqError("Creator not found");
		}
		throw error;
	}

	const created = await loadMcqWithChoices(mcqId);
	if (!created) {
		throw new Error("Failed to create question");
	}
	return created;
}

export async function updateMcq(id: string, input: UpdateMcqInput): Promise<McqWithChoices> {
	await requireMcq(id);
	const fields = validateMcqFields(input.name, input.question, input.choices);
	const db = await getDb();

	await db.batch([
		db
			.prepare("UPDATE mcqs SET name = ?1, question = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3")
			.bind(fields.name, fields.question, id),
		db.prepare("DELETE FROM mcq_choices WHERE mcq_id = ?1").bind(id),
		...choiceInserts(db, id, fields.choices),
	]);

	const updated = await loadMcqWithChoices(id);
	if (!updated) {
		throw new McqNotFoundError();
	}
	return updated;
}

export async function deleteMcq(id: string): Promise<void> {
	await requireMcq(id);
	const db = await getDb();
	await db.prepare("DELETE FROM mcqs WHERE id = ?1").bind(id).run();
}

export async function createAttempt(mcqId: string, choiceId: string): Promise<McqAttempt> {
	await requireMcq(mcqId);

	const choiceRows = await queryAll<ChoiceRow>(
		"SELECT id, choice_text, is_correct, position FROM mcq_choices WHERE id = ?1 AND mcq_id = ?2",
		[choiceId, mcqId],
	);
	const choice = choiceRows[0];
	if (!choice) {
		throw new ChoiceNotFoundError();
	}

	const attemptId = crypto.randomUUID();
	const rows = await queryAll<AttemptRow>(
		"INSERT INTO mcq_attempts (id, mcq_id, choice_id, is_correct) VALUES (?1, ?2, ?3, ?4) RETURNING id, mcq_id, choice_id, is_correct, created_at",
		[attemptId, mcqId, choiceId, choice.is_correct],
	);
	const row = rows[0];
	if (!row) {
		throw new Error("Failed to record attempt");
	}
	return toAttempt(row);
}

export async function listAttempts(mcqId: string): Promise<McqAttempt[]> {
	await requireMcq(mcqId);
	const rows = await queryAll<AttemptRow>(
		"SELECT id, mcq_id, choice_id, is_correct, created_at FROM mcq_attempts WHERE mcq_id = ?1 ORDER BY created_at DESC",
		[mcqId],
	);
	return rows.map(toAttempt);
}
