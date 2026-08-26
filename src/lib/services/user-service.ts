import { getCloudflareContext } from "@opennextjs/cloudflare";

export type PublicUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

export type UserAuthRecord = PublicUser & {
	passwordHash: string;
};

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type UpdateUserInput = {
	firstName?: string;
	lastName?: string;
	username?: string;
	email?: string;
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash?: string;
};

export class UserAlreadyExistsError extends Error {
	constructor(message = "Username or email already exists") {
		super(message);
		this.name = "UserAlreadyExistsError";
	}
}

async function getDb() {
	const { env } = await getCloudflareContext({ async: true });
	return env.DB;
}

function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
	};
}

function isUniqueConstraintError(error: unknown): boolean {
	const parts: string[] = [];
	if (error instanceof Error) {
		parts.push(error.message);
		if (error.cause instanceof Error) {
			parts.push(error.cause.message);
		}
	} else {
		parts.push(String(error));
	}
	return /UNIQUE constraint failed/i.test(parts.join(" "));
}

async function queryAll<T>(sql: string, binds: unknown[]): Promise<T[]> {
	const db = await getDb();
	const result = await db.prepare(sql).bind(...binds).all<T>();
	return result.results;
}

async function findPublicById(id: string): Promise<PublicUser | null> {
	const rows = await queryAll<UserRow>(
		"SELECT id, first_name, last_name, username, email FROM users WHERE id = ?1",
		[id],
	);
	const row = rows[0];
	return row ? toPublicUser(row) : null;
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
	try {
		const rows = await queryAll<UserRow>(
			"INSERT INTO users (first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, first_name, last_name, username, email",
			[input.firstName, input.lastName, input.username, input.email, input.passwordHash],
		);
		const row = rows[0];
		if (!row) {
			throw new Error("Failed to create user");
		}
		return toPublicUser(row);
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new UserAlreadyExistsError();
		}
		throw error;
	}
}

export async function findByUsername(username: string): Promise<PublicUser | null> {
	const rows = await queryAll<UserRow>(
		"SELECT id, first_name, last_name, username, email FROM users WHERE username = ?1",
		[username],
	);
	const row = rows[0];
	return row ? toPublicUser(row) : null;
}

export async function findAuthByUsername(username: string): Promise<UserAuthRecord | null> {
	const rows = await queryAll<UserRow>(
		"SELECT id, first_name, last_name, username, email, password_hash FROM users WHERE username = ?1",
		[username],
	);
	const row = rows[0];
	if (!row || row.password_hash === undefined) {
		return null;
	}
	return {
		...toPublicUser(row),
		passwordHash: row.password_hash,
	};
}

export async function updateUser(
	id: string,
	patch: UpdateUserInput,
): Promise<PublicUser | null> {
	const current = await findPublicById(id);
	if (!current) {
		return null;
	}

	const next = {
		firstName: patch.firstName ?? current.firstName,
		lastName: patch.lastName ?? current.lastName,
		username: patch.username ?? current.username,
		email: patch.email ?? current.email,
	};

	try {
		const rows = await queryAll<UserRow>(
			"UPDATE users SET first_name = ?1, last_name = ?2, username = ?3, email = ?4 WHERE id = ?5 RETURNING id, first_name, last_name, username, email",
			[next.firstName, next.lastName, next.username, next.email, id],
		);
		const row = rows[0];
		return row ? toPublicUser(row) : null;
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new UserAlreadyExistsError();
		}
		throw error;
	}
}

export async function deleteUser(id: string): Promise<void> {
	const db = await getDb();
	await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
}
