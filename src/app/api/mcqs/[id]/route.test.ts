import {
	deleteMcq,
	getMcq,
	McqNotFoundError,
	updateMcq,
} from "@/lib/services/mcq-service";
import { DELETE, GET, PUT } from "./route";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		getMcq: vi.fn(),
		updateMcq: vi.fn(),
		deleteMcq: vi.fn(),
	};
});

const question = {
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

const updateBody = {
	name: "Multiplication warmup",
	question: "What is 3 x 3?",
	choices: [
		{ text: "6", isCorrect: false },
		{ text: "9", isCorrect: true },
	],
};

const context = { params: Promise.resolve({ id: "mcq-1" }) };

function put(body: unknown) {
	return PUT(
		new Request("http://localhost/api/mcqs/mcq-1", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		context,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/mcqs/:id", () => {
	it("returns 200 and the question with choices", async () => {
		vi.mocked(getMcq).mockResolvedValue(question);

		const response = await GET(new Request("http://localhost/api/mcqs/mcq-1"), context);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual(question);
		expect(getMcq).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when the question is missing", async () => {
		vi.mocked(getMcq).mockResolvedValue(null);

		const response = await GET(new Request("http://localhost/api/mcqs/missing"), {
			params: Promise.resolve({ id: "missing" }),
		});
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json).toEqual({ error: "Question not found" });
	});
});

describe("PUT /api/mcqs/:id", () => {
	it("returns 200 and does not send createdBy to the service", async () => {
		vi.mocked(updateMcq).mockResolvedValue({ ...question, ...updateBody, choices: question.choices });

		const response = await put({ ...updateBody, createdBy: "someone-else" });
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.id).toBe("mcq-1");
		expect(updateMcq).toHaveBeenCalledWith("mcq-1", updateBody);
		expect(updateMcq).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ createdBy: expect.anything() }),
		);
	});

	it("returns 400 for an invalid body", async () => {
		const response = await put({ name: "", question: updateBody.question, choices: updateBody.choices });
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json).toEqual({ error: expect.any(String) });
		expect(updateMcq).not.toHaveBeenCalled();
	});

	it("returns 404 when the service cannot find the question", async () => {
		vi.mocked(updateMcq).mockRejectedValue(new McqNotFoundError());

		const response = await put(updateBody);
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json).toEqual({ error: "Question not found" });
	});
});

describe("DELETE /api/mcqs/:id", () => {
	it("returns 200 { ok: true }", async () => {
		vi.mocked(deleteMcq).mockResolvedValue(undefined);

		const response = await DELETE(new Request("http://localhost/api/mcqs/mcq-1"), context);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({ ok: true });
		expect(deleteMcq).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when the question is missing", async () => {
		vi.mocked(deleteMcq).mockRejectedValue(new McqNotFoundError());

		const response = await DELETE(new Request("http://localhost/api/mcqs/missing"), {
			params: Promise.resolve({ id: "missing" }),
		});
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json).toEqual({ error: "Question not found" });
	});
});
