import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqPreview } from "./mcq-preview";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

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

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", vi.fn());
});

describe("McqPreview", () => {
	it("shows choices without revealing the correct answer until submit", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(question), { status: 200 }));

		render(<McqPreview id="mcq-1" />);

		expect(await screen.findByRole("heading", { name: "Addition warmup" })).toBeTruthy();
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByRole("radio", { name: "3" })).toBeTruthy();
		expect(screen.getByRole("radio", { name: "4" })).toBeTruthy();
		expect(screen.queryByText(/^correct$/i)).toBeNull();
		expect(screen.queryByText(/^incorrect$/i)).toBeNull();
		expect(screen.getByRole("button", { name: /submit answer/i })).toHaveProperty("disabled", true);
	});

	it("submits an attempt and then blocks a second submit", async () => {
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			if (String(input) === "/api/mcqs/mcq-1/attempts" && init?.method === "POST") {
				return new Response(
					JSON.stringify({
						id: "att-1",
						mcqId: "mcq-1",
						choiceId: "c2",
						isCorrect: true,
						createdAt: "2026-09-02 18:01:00",
					}),
					{ status: 201 },
				);
			}
			return new Response(JSON.stringify(question), { status: 200 });
		});

		const user = userEvent.setup();
		render(<McqPreview id="mcq-1" />);
		expect(await screen.findByRole("radio", { name: "4" })).toBeTruthy();

		await user.click(screen.getByRole("radio", { name: "4" }));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/mcqs/mcq-1/attempts",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ choiceId: "c2" }),
				}),
			);
		});
		expect(await screen.findByText(/^correct$/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /submit answer/i })).toHaveProperty("disabled", true);
	});

	it("shows incorrect after a wrong attempt", async () => {
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			if (init?.method === "POST") {
				return new Response(
					JSON.stringify({
						id: "att-2",
						mcqId: "mcq-1",
						choiceId: "c1",
						isCorrect: false,
						createdAt: "2026-09-02 18:01:00",
					}),
					{ status: 201 },
				);
			}
			return new Response(JSON.stringify(question), { status: 200 });
		});

		const user = userEvent.setup();
		render(<McqPreview id="mcq-1" />);
		await user.click(await screen.findByRole("radio", { name: "3" }));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		expect(await screen.findByText(/^incorrect$/i)).toBeTruthy();
	});
});
