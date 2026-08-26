import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
	UserAlreadyExistsError,
	createUser,
	deleteUser,
	findAuthByUsername,
	findByUsername,
	updateUser,
} from "./user-service";

const { fakeDb, getCloudflareContextMock } = vi.hoisted(() => {
	type UserRow = {
		id: string;
		first_name: string;
		last_name: string;
		username: string;
		email: string;
		password_hash: string;
	};

	const rows = new Map<string, UserRow>();
	const statements: { sql: string; binds: unknown[] }[] = [];
	let firstCalls = 0;

	function pickColumns(row: UserRow, sql: string): Record<string, unknown> {
		const selected: Record<string, unknown> = {
			id: row.id,
			first_name: row.first_name,
			last_name: row.last_name,
			username: row.username,
			email: row.email,
		};
		if (/password_hash/i.test(sql)) {
			selected.password_hash = row.password_hash;
		}
		return selected;
	}

	function execute(sql: string, binds: unknown[]): Record<string, unknown>[] {
		if (/^\s*INSERT/i.test(sql)) {
			const [first_name, last_name, username, email, password_hash] = binds as string[];
			for (const row of rows.values()) {
				if (row.username === username) {
					throw new Error("UNIQUE constraint failed: users.username");
				}
				if (row.email === email) {
					throw new Error("UNIQUE constraint failed: users.email");
				}
			}
			const id = crypto.randomUUID();
			const row: UserRow = {
				id,
				first_name,
				last_name,
				username,
				email,
				password_hash,
			};
			rows.set(id, row);
			return /RETURNING/i.test(sql) ? [pickColumns(row, sql)] : [];
		}

		if (/^\s*SELECT/i.test(sql)) {
			return [...rows.values()]
				.filter((row) => {
					if (/WHERE\s+username\s*=/i.test(sql)) {
						return row.username === binds[0];
					}
					if (/WHERE\s+id\s*=/i.test(sql)) {
						return row.id === binds[0];
					}
					return false;
				})
				.map((row) => pickColumns(row, sql));
		}

		if (/^\s*UPDATE/i.test(sql)) {
			const id = String(binds[binds.length - 1]);
			const existing = rows.get(id);
			if (!existing) {
				return [];
			}
			existing.first_name = String(binds[0]);
			existing.last_name = String(binds[1]);
			existing.username = String(binds[2]);
			existing.email = String(binds[3]);
			return /RETURNING/i.test(sql) ? [pickColumns(existing, sql)] : [];
		}

		if (/^\s*DELETE/i.test(sql)) {
			rows.delete(String(binds[0]));
			return [];
		}

		throw new Error(`Unsupported SQL in fake D1: ${sql}`);
	}

	const fakeDb = {
		rows,
		statements,
		get lastSql() {
			return statements.at(-1)?.sql ?? "";
		},
		get lastBinds() {
			return statements.at(-1)?.binds ?? [];
		},
		get firstCalls() {
			return firstCalls;
		},
		reset() {
			rows.clear();
			statements.length = 0;
			firstCalls = 0;
		},
		prepare(sql: string) {
			const binds: unknown[] = [];
			const statement = {
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
					throw new Error("user service must use all().results, not first()");
				},
			};
			return statement;
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

const ada = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
	passwordHash: "a".repeat(64),
};

beforeEach(() => {
	vi.clearAllMocks();
	fakeDb.reset();
	getCloudflareContextMock.mockResolvedValue({
		env: { DB: fakeDb },
	});
});

describe("createUser", () => {
	it("binds create fields with numbered placeholders, not concatenated SQL", async () => {
		await createUser(ada);

		const insert = fakeDb.statements.find((statement) => /^\s*INSERT/i.test(statement.sql));
		expect(insert).toBeDefined();
		expect(insert?.sql).toMatch(/\?1/);
		expect(insert?.sql).toMatch(/\?2/);
		expect(insert?.sql).toMatch(/\?3/);
		expect(insert?.sql).toMatch(/\?4/);
		expect(insert?.sql).toMatch(/\?5/);
		expect(insert?.sql).not.toContain(ada.username);
		expect(insert?.sql).not.toContain(ada.passwordHash);
		expect(insert?.binds).toEqual([
			ada.firstName,
			ada.lastName,
			ada.username,
			ada.email,
			ada.passwordHash,
		]);
	});

	it("returns a public user and never includes the password hash", async () => {
		const user = await createUser(ada);

		expect(user).toEqual({
			id: expect.any(String),
			firstName: ada.firstName,
			lastName: ada.lastName,
			username: ada.username,
			email: ada.email,
		});
		expect(user).not.toHaveProperty("passwordHash");
		expect(user).not.toHaveProperty("password_hash");
		expect(fakeDb.rows.size).toBe(1);
	});

	it("succeeds when username and email are the same string", async () => {
		const user = await createUser(ada);

		expect(user.username).toBe(user.email);
		expect(user.username).toBe("ada@school.edu");
	});

	it("maps a unique constraint failure to UserAlreadyExistsError", async () => {
		await createUser(ada);

		await expect(
			createUser({
				...ada,
				firstName: "Ada",
				lastName: "Byron",
			}),
		).rejects.toBeInstanceOf(UserAlreadyExistsError);
		expect(fakeDb.rows.size).toBe(1);
	});
});

describe("findByUsername", () => {
	it("returns the public user when a row exists", async () => {
		const created = await createUser(ada);

		const found = await findByUsername(ada.username);

		expect(found).toEqual(created);
		expect(found).not.toHaveProperty("passwordHash");
		expect(found).not.toHaveProperty("password_hash");
		expect(fakeDb.lastSql).not.toMatch(/password_hash/i);
	});

	it("returns null when no row exists", async () => {
		await expect(findByUsername("missing")).resolves.toBeNull();
	});

	it("reads with all().results and never calls first()", async () => {
		await createUser(ada);
		await findByUsername(ada.username);

		expect(fakeDb.firstCalls).toBe(0);
		expect(getCloudflareContext).toHaveBeenCalled();
	});
});

describe("findAuthByUsername", () => {
	it("is the only lookup that exposes the stored password hash", async () => {
		const created = await createUser(ada);

		const auth = await findAuthByUsername(ada.username);
		const publicUser = await findByUsername(ada.username);

		expect(auth).toEqual({
			...created,
			passwordHash: ada.passwordHash,
		});
		expect(publicUser).not.toHaveProperty("passwordHash");
		const authSql = fakeDb.statements.find((statement) =>
			/password_hash/i.test(statement.sql),
		)?.sql;
		expect(authSql).toMatch(/password_hash/i);
		expect(fakeDb.lastSql).not.toMatch(/password_hash/i);
	});

	it("returns null when no row exists", async () => {
		await expect(findAuthByUsername("missing")).resolves.toBeNull();
	});
});

describe("updateUser", () => {
	it("persists name, username, and email changes on the same row", async () => {
		const created = await createUser(ada);

		const updated = await updateUser(created.id, {
			firstName: "Augusta",
			lastName: "Byron",
			username: "augusta",
			email: "augusta@school.edu",
		});

		expect(updated).toEqual({
			id: created.id,
			firstName: "Augusta",
			lastName: "Byron",
			username: "augusta",
			email: "augusta@school.edu",
		});
		expect(fakeDb.rows.size).toBe(1);
		expect([...fakeDb.rows.values()][0]?.id).toBe(created.id);
		expect(fakeDb.statements.some((statement) => /^\s*UPDATE/i.test(statement.sql))).toBe(true);
		expect(fakeDb.statements.filter((statement) => /^\s*INSERT/i.test(statement.sql))).toHaveLength(
			1,
		);
		await expect(findByUsername(ada.username)).resolves.toBeNull();
		await expect(findByUsername("augusta")).resolves.toEqual(updated);
	});
});

describe("deleteUser", () => {
	it("removes the row so a later lookup returns null", async () => {
		const created = await createUser(ada);

		await deleteUser(created.id);

		await expect(findByUsername(ada.username)).resolves.toBeNull();
		expect(fakeDb.rows.size).toBe(0);
	});
});
