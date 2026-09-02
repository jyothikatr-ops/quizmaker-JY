import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CURRENT_USER_KEY, setCurrentUser } from "@/lib/auth/current-user";
import { McqList } from "./mcq-list";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const questions = {
	mcqs: [
		{
			id: "mcq-1",
			name: "Addition warmup",
			question: "What is 2 + 2?",
			createdBy: "user-ada",
			createdAt: "2026-09-02 18:00:00",
			updatedAt: "2026-09-02 18:00:00",
		},
	],
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
	vi.mocked(fetch).mockImplementation(async (input, init) => {
		return handler(String(input), init);
	});
}

async function openActions(user: ReturnType<typeof userEvent.setup>) {
	const trigger = screen.getByRole("button", { name: /open actions/i });
	trigger.focus();
	await user.keyboard("{Enter}");
}

beforeEach(() => {
	vi.clearAllMocks();
	sessionStorage.clear();
	vi.stubGlobal("fetch", vi.fn());
	mockFetch(() => new Response(JSON.stringify(questions), { status: 200 }));
});

describe("McqList", () => {
	it("renders name and question rows after loading", async () => {
		render(<McqList />);

		expect(await screen.findByText("Addition warmup")).toBeTruthy();
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: /name/i })).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: /question/i })).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: /actions/i })).toBeTruthy();
	});

	it("shows an empty state with a create action when there are no questions", async () => {
		mockFetch(() => new Response(JSON.stringify({ mcqs: [] }), { status: 200 }));

		render(<McqList />);

		expect(await screen.findByText(/no questions yet/i)).toBeTruthy();
		expect(screen.getAllByRole("link", { name: /create question/i }).length).toBeGreaterThan(0);
		expect(screen.queryByRole("row", { name: /addition/i })).toBeNull();
	});

	it("navigates to create, edit, and preview from the list", async () => {
		const user = userEvent.setup();
		render(<McqList />);

		expect(await screen.findByText("Addition warmup")).toBeTruthy();
		expect(screen.getByRole("link", { name: /create question/i })).toHaveProperty(
			"href",
			expect.stringContaining("/mcqs/new"),
		);

		await openActions(user);
		await user.click(await screen.findByRole("menuitem", { name: /^edit$/i }));
		expect(push).toHaveBeenCalledWith("/mcqs/mcq-1/edit");

		await openActions(user);
		await user.click(await screen.findByRole("menuitem", { name: /^preview$/i }));
		expect(push).toHaveBeenCalledWith("/mcqs/mcq-1/preview");
	});

	it("asks for confirmation before deleting and refreshes the list", async () => {
		const user = userEvent.setup();
		let deleted = false;
		mockFetch((url, init) => {
			if (url === "/api/mcqs/mcq-1" && init?.method === "DELETE") {
				deleted = true;
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}
			return new Response(JSON.stringify({ mcqs: deleted ? [] : questions.mcqs }), {
				status: 200,
			});
		});

		render(<McqList />);
		expect(await screen.findByText("Addition warmup")).toBeTruthy();

		await openActions(user);
		await user.click(await screen.findByRole("menuitem", { name: /^delete$/i }));

		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/delete question\?/i)).toBeTruthy();
		expect(within(dialog).getByText("Addition warmup")).toBeTruthy();

		await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/mcqs/mcq-1",
				expect.objectContaining({ method: "DELETE" }),
			);
		});
		expect(await screen.findByText(/no questions yet/i)).toBeTruthy();
	});

	it("logs out via POST, clears the stored user, and navigates to /login", async () => {
		setCurrentUser({
			id: "user-ada",
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
		});
		mockFetch((url) => {
			if (url === "/api/auth/logout") {
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}
			return new Response(JSON.stringify(questions), { status: 200 });
		});

		const user = userEvent.setup();
		render(<McqList />);
		expect(await screen.findByText("Addition warmup")).toBeTruthy();

		await user.click(screen.getByRole("button", { name: /log out/i }));

		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/logout",
			expect.objectContaining({ method: "POST" }),
		);
		expect(sessionStorage.getItem(CURRENT_USER_KEY)).toBeNull();
		expect(push).toHaveBeenCalledWith("/login");
	});
});
