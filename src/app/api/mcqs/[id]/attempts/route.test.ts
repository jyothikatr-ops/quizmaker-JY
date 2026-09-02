import {
	ChoiceNotFoundError,
	createAttempt,
	listAttempts,
	McqNotFoundError,
} from "@/lib/services/mcq-service";
import { GET, POST } from "./route";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		createAttempt: vi.fn(),
		listAttempts: vi.fn(),
	};
});

const attempt = {
	id: "att-1",
	mcqId: "mcq-1",
	choiceId: "c2",
	isCorrect: true,
	createdAt: "2026-09-02 18:01:00",
};

const context = { params: Promise.resolve({ id: "mcq-1" }) };

function post(body: unknown) {
	return POST(
		new Request("http://localhost/api/mcqs/mcq-1/attempts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		context,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/mcqs/:id/attempts", () => {
	it("returns 201 and the recorded attempt", async () => {
		vi.mocked(createAttempt).mockResolvedValue(attempt);

		const response = await post({ choiceId: "c2" });
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json).toEqual(attempt);
		expect(createAttempt).toHaveBeenCalledWith("mcq-1", "c2");
	});

	it("returns 400 when choiceId is missing", async () => {
		const response = await post({});
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json).toEqual({ error: expect.any(String) });
		expect(createAttempt).not.toHaveBeenCalled();
	});

	it("returns 404 for a missing question or choice", async () => {
		vi.mocked(createAttempt).mockRejectedValueOnce(new McqNotFoundError());
		const missingQuestion = await post({ choiceId: "c2" });
		expect(missingQuestion.status).toBe(404);
		expect(await missingQuestion.json()).toEqual({ error: "Question not found" });

		vi.mocked(createAttempt).mockRejectedValueOnce(new ChoiceNotFoundError());
		const missingChoice = await post({ choiceId: "missing" });
		expect(missingChoice.status).toBe(404);
		expect(await missingChoice.json()).toEqual({ error: "Choice not found" });
	});
});

describe("GET /api/mcqs/:id/attempts", () => {
	it("returns 200 and the attempts list", async () => {
		vi.mocked(listAttempts).mockResolvedValue([attempt]);

		const response = await GET(new Request("http://localhost/api/mcqs/mcq-1/attempts"), context);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({ attempts: [attempt] });
		expect(listAttempts).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when the question is missing", async () => {
		vi.mocked(listAttempts).mockRejectedValue(new McqNotFoundError());

		const response = await GET(new Request("http://localhost/api/mcqs/missing/attempts"), {
			params: Promise.resolve({ id: "missing" }),
		});
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json).toEqual({ error: "Question not found" });
	});
});
