import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function wranglerConfig(): string {
	return readFileSync(path.join(process.cwd(), "wrangler.jsonc"), "utf8");
}

function usersMigrationSql(): string {
	const migrationsDir = path.join(process.cwd(), "migrations");
	if (!existsSync(migrationsDir)) {
		throw new Error("migrations directory does not exist");
	}

	const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
	if (sqlFiles.length === 0) {
		throw new Error("no SQL files found in migrations/");
	}

	return sqlFiles
		.map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
		.join("\n");
}

describe("users D1 schema contract", () => {
	it("declares a d1_databases binding named DB in wrangler.jsonc", () => {
		const config = wranglerConfig();

		expect(config).toMatch(/"d1_databases"\s*:/);
		expect(config).toMatch(
			/"d1_databases"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"DB"/,
		);
	});

	it("has a migration that creates the users table", () => {
		expect(usersMigrationSql()).toMatch(/CREATE TABLE users\b/i);
	});

	it("defines the required users columns", () => {
		const sql = usersMigrationSql();
		const tableMatch = sql.match(/CREATE TABLE users\s*\(([\s\S]*?)\)\s*;/i);

		expect(tableMatch).not.toBeNull();
		const tableBody = tableMatch?.[1] ?? "";

		expect(tableBody).toMatch(/\bid\b/);
		expect(tableBody).toMatch(/\bfirst_name\b/);
		expect(tableBody).toMatch(/\blast_name\b/);
		expect(tableBody).toMatch(/\busername\b/);
		expect(tableBody).toMatch(/\bemail\b/);
		expect(tableBody).toMatch(/\bpassword_hash\b/);
		expect(tableBody).toMatch(/\bcreated_at\b/);
	});

	it("stores credentials in password_hash, not a plaintext password column", () => {
		const sql = usersMigrationSql();
		const tableMatch = sql.match(/CREATE TABLE users\s*\(([\s\S]*?)\)\s*;/i);
		const tableBody = tableMatch?.[1] ?? "";

		expect(tableBody).toMatch(/\bpassword_hash\b/);
		expect(tableBody).not.toMatch(/(^|,)\s*password\s+/im);
	});

	it("requires username and email to be unique", () => {
		const sql = usersMigrationSql();
		const tableMatch = sql.match(/CREATE TABLE users\s*\(([\s\S]*?)\)\s*;/i);
		const tableBody = tableMatch?.[1] ?? "";

		expect(tableBody).toMatch(/\busername\s+TEXT\s+NOT NULL\s+UNIQUE\b/i);
		expect(tableBody).toMatch(/\bemail\s+TEXT\s+NOT NULL\s+UNIQUE\b/i);
	});

	it("indexes username and email", () => {
		const sql = usersMigrationSql();

		expect(sql).toMatch(/CREATE INDEX \w+\s+ON users\s*\(\s*username\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX \w+\s+ON users\s*\(\s*email\s*\)/i);
	});
});
