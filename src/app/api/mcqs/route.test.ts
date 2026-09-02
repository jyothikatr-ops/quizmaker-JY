import { createMcq, InvalidMcqError, listMcqs } from "@/lib/services/mcq-service";
import { GET, POST } from "./route";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		listMcqs: vi.fn(),
		createMcq: vi.fn(),
	};
});

const created = {
	id: "mcq-1",
	name: "Addition warmup",
	question: "What is 2 + 2?",
	createdBy: "user-ada",
	createdAt: "2026-09-02 18:00:00",
	updatedAt: "2026-09-02 18:00:00",
	choices: [
		{ id: "c1", text: "3", isCorrect: false, position: 1 },
		{ id: "c2", text: "4", isCorrect: true, position: 2 },
	],
};

const validBody = {
	name: "Addition warmup",
	question: "What is 2 + 2?",
	createdBy: "user-ada",
	choices: [
		{ text: "3", isCorrect: false },
		{ text: "4", isCorrect: true },
	],
};

function post(body: unknown) {
	return POST(
		new Request("http://localhost/api/mcqs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/mcqs", () => {
	it("returns 200 and the listed questions", async () => {
		const listed = [{ ...created }];
		delete (listed[0] as { choices?: unknown }).choices;
		vi.mocked(listMcqs).mockResolvedValue(listed);

		const response = await GET();
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({ mcqs: listed });
		expect(listMcqs).toHaveBeenCalledOnce();
	});

	it("returns 500 when the service throws unexpectedly", async () => {
		vi.mocked(listMcqs).mockRejectedValue(new Error("boom"));

		const response = await GET();
		const json = await response.json();

		expect(response.status).toBe(500);
		expect(json).toEqual({ error: "Server error" });
	});
});

describe("POST /api/mcqs", () => {
	it("returns 201 and the created question", async () => {
		vi.mocked(createMcq).mockResolvedValue(created);

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json).toEqual(created);
		expect(createMcq).toHaveBeenCalledWith(validBody);
	});

	it("returns 400 for invalid JSON or a missing createdBy", async () => {
		const invalidJson = await POST(
			new Request("http://localhost/api/mcqs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{",
			}),
		);
		expect(invalidJson.status).toBe(400);
		expect(await invalidJson.json()).toEqual({ error: "Invalid JSON" });

		const missingCreator = await post({
			name: validBody.name,
			question: validBody.question,
			choices: validBody.choices,
		});
		expect(missingCreator.status).toBe(400);
		expect(await missingCreator.json()).toEqual({ error: expect.any(String) });
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when the service rejects the question", async () => {
		vi.mocked(createMcq).mockRejectedValue(new InvalidMcqError("Creator not found"));

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json).toEqual({ error: "Creator not found" });
	});

	it("returns 500 when the service throws unexpectedly", async () => {
		vi.mocked(createMcq).mockRejectedValue(new Error("boom"));

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(500);
		expect(json).toEqual({ error: "Server error" });
	});
});
