import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setCurrentUser } from "@/lib/auth/current-user";
import { McqForm } from "./mcq-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const storedUser = {
	id: "user-ada",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

const existing = {
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
	sessionStorage.clear();
	setCurrentUser(storedUser);
	vi.stubGlobal("fetch", vi.fn());
});

async function fillValidCreate(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/^name$/i), "Addition warmup");
	await user.type(screen.getByLabelText(/^question$/i), "What is 2 + 2?");
	await user.type(screen.getByLabelText(/^choice 1$/i), "3");
	await user.type(screen.getByLabelText(/^choice 2$/i), "4");
	await user.click(screen.getByRole("radio", { name: /mark choice 2 as correct/i }));
}

describe("McqForm create", () => {
	it("starts with two choices and can add up to six, but not remove below two", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);

		expect(screen.getByLabelText(/^choice 1$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice 2$/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^choice 3$/i)).toBeNull();

		const removeButtons = screen.getAllByRole("button", { name: /remove choice/i });
		expect(removeButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

		await user.click(screen.getByRole("button", { name: /add choice/i }));
		expect(screen.getByLabelText(/^choice 3$/i)).toBeTruthy();

		for (let index = 0; index < 3; index += 1) {
			await user.click(screen.getByRole("button", { name: /add choice/i }));
		}
		expect(screen.getByLabelText(/^choice 6$/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: /add choice/i })).toBeNull();
	});

	it("validates before fetch", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);

		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(await screen.findByText("Name is required.")).toBeTruthy();
		expect(fetch).not.toHaveBeenCalled();

		await user.type(screen.getByLabelText(/^name$/i), "Addition warmup");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(await screen.findByText("Question is required.")).toBeTruthy();

		await user.type(screen.getByLabelText(/^question$/i), "What is 2 + 2?");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(await screen.findByText("Each choice needs text.")).toBeTruthy();

		await user.type(screen.getByLabelText(/^choice 1$/i), "3");
		await user.type(screen.getByLabelText(/^choice 2$/i), "4");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(await screen.findByText("Mark one choice as correct.")).toBeTruthy();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("POSTs with createdBy and navigates home on 201", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "mcq-1" }), { status: 201 }),
		);
		const user = userEvent.setup();
		render(<McqForm mode="create" />);
		await fillValidCreate(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/mcqs",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						name: "Addition warmup",
						question: "What is 2 + 2?",
						createdBy: "user-ada",
						choices: [
							{ text: "3", isCorrect: false },
							{ text: "4", isCorrect: true },
						],
					}),
				}),
			);
		});
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("does not POST a fake creator when no user is stored", async () => {
		sessionStorage.clear();
		const user = userEvent.setup();
		render(<McqForm mode="create" />);

		expect(screen.getByText("Log in to create a question.")).toBeTruthy();
		expect(screen.getByRole("link", { name: /log in/i })).toHaveProperty(
			"href",
			expect.stringContaining("/login"),
		);

		await fillValidCreate(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(fetch).not.toHaveBeenCalled();
	});

	it("navigates home on cancel without writing", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);

		await user.click(screen.getByRole("button", { name: /^cancel$/i }));
		expect(push).toHaveBeenCalledWith("/mcqs");
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("McqForm edit", () => {
	it("PUTs without createdBy and navigates home on 200", async () => {
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			if (String(input) === "/api/mcqs/mcq-1" && (!init || init.method === "GET" || !init.method)) {
				return new Response(JSON.stringify(existing), { status: 200 });
			}
			return new Response(JSON.stringify(existing), { status: 200 });
		});

		const user = userEvent.setup();
		render(<McqForm mode="edit" id="mcq-1" />);

		expect(await screen.findByDisplayValue("Addition warmup")).toBeTruthy();
		await user.clear(screen.getByLabelText(/^name$/i));
		await user.type(screen.getByLabelText(/^name$/i), "Multiplication warmup");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/mcqs/mcq-1",
				expect.objectContaining({
					method: "PUT",
					body: expect.not.stringContaining("createdBy"),
				}),
			);
		});
		const putCall = vi.mocked(fetch).mock.calls.find((call) => {
			const init = call[1];
			return init?.method === "PUT";
		});
		expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
			name: "Multiplication warmup",
			question: "What is 2 + 2?",
			choices: [
				{ text: "3", isCorrect: false },
				{ text: "4", isCorrect: true },
			],
		});
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows a not-found message when the question is missing", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "Question not found" }), { status: 404 }),
		);

		render(<McqForm mode="edit" id="missing" />);

		expect(await screen.findByText(/question not found/i)).toBeTruthy();
		expect(screen.getByRole("link", { name: /back to questions/i })).toHaveProperty(
			"href",
			expect.stringContaining("/mcqs"),
		);
	});
});
