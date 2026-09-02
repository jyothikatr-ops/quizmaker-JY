import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function wranglerConfig(): string {
	return readFileSync(path.join(process.cwd(), "wrangler.jsonc"), "utf8");
}

function mcqMigrationPath(): string {
	return path.join(process.cwd(), "migrations", "0002_create_mcq_tables.sql");
}

function mcqMigrationSql(): string {
	const filePath = mcqMigrationPath();
	if (!existsSync(filePath)) {
		throw new Error("migrations/0002_create_mcq_tables.sql does not exist");
	}
	return readFileSync(filePath, "utf8");
}

function tableBody(sql: string, tableName: string): string {
	const match = sql.match(new RegExp(`CREATE TABLE ${tableName}\\s*\\(([\\s\\S]*?)\\)\\s*;`, "i"));
	expect(match).not.toBeNull();
	return match?.[1] ?? "";
}

describe("mcq D1 schema contract", () => {
	it("declares a d1_databases binding named DB in wrangler.jsonc", () => {
		const config = wranglerConfig();

		expect(config).toMatch(/"d1_databases"\s*:/);
		expect(config).toMatch(/"d1_databases"\s*:\s*\[[\s\S]*?"binding"\s*:\s*"DB"/);
	});

	it("has migration 0002 that creates mcqs, mcq_choices, and mcq_attempts", () => {
		const sql = mcqMigrationSql();

		expect(sql).toMatch(/CREATE TABLE mcqs\b/i);
		expect(sql).toMatch(/CREATE TABLE mcq_choices\b/i);
		expect(sql).toMatch(/CREATE TABLE mcq_attempts\b/i);
	});

	it("defines the required mcqs columns and no description column", () => {
		const body = tableBody(mcqMigrationSql(), "mcqs");

		expect(body).toMatch(/\bid\b/);
		expect(body).toMatch(/\bname\s+TEXT\s+NOT NULL\b/i);
		expect(body).toMatch(/\bquestion\s+TEXT\s+NOT NULL\b/i);
		expect(body).toMatch(/\bcreated_by\s+TEXT\s+NOT NULL\b/i);
		expect(body).toMatch(/\bcreated_at\b/);
		expect(body).toMatch(/\bupdated_at\b/);
		expect(body).not.toMatch(/\bdescription\b/i);
	});

	it("references users.id from mcqs.created_by", () => {
		const body = tableBody(mcqMigrationSql(), "mcqs");

		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*created_by\s*\)\s*REFERENCES\s+users\s*\(\s*id\s*\)/i,
		);
		expect(body).not.toMatch(/ON DELETE CASCADE/i);
	});

	it("defines the required mcq_choices columns and cascades off mcqs", () => {
		const body = tableBody(mcqMigrationSql(), "mcq_choices");

		expect(body).toMatch(/\bid\b/);
		expect(body).toMatch(/\bmcq_id\s+TEXT\s+NOT NULL\b/i);
		expect(body).toMatch(/\bchoice_text\s+TEXT\s+NOT NULL\b/i);
		expect(body).toMatch(/\bis_correct\s+INTEGER\s+NOT NULL\b/i);
		expect(body).toMatch(/\bposition\s+INTEGER\s+NOT NULL\b/i);
		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i,
		);
	});

	it("defines the required mcq_attempts columns and preserves attempts when a choice is removed", () => {
		const body = tableBody(mcqMigrationSql(), "mcq_attempts");

		expect(body).toMatch(/\bid\b/);
		expect(body).toMatch(/\bmcq_id\s+TEXT\s+NOT NULL\b/i);
		expect(body).toMatch(/\bchoice_id\b/);
		expect(body).not.toMatch(/\bchoice_id\s+TEXT\s+NOT NULL\b/i);
		expect(body).toMatch(/\bis_correct\s+INTEGER\s+NOT NULL\b/i);
		expect(body).toMatch(/\bcreated_at\b/);
		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i,
		);
		expect(body).toMatch(
			/FOREIGN KEY\s*\(\s*choice_id\s*\)\s*REFERENCES\s+mcq_choices\s*\(\s*id\s*\)\s*ON DELETE SET NULL/i,
		);
	});

	it("indexes created_by, choice mcq_id, and attempt foreign keys", () => {
		const sql = mcqMigrationSql();

		expect(sql).toMatch(/CREATE INDEX \w+\s+ON mcqs\s*\(\s*created_by\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX \w+\s+ON mcq_choices\s*\(\s*mcq_id\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX \w+\s+ON mcq_attempts\s*\(\s*mcq_id\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX \w+\s+ON mcq_attempts\s*\(\s*choice_id\s*\)/i);
	});
});
