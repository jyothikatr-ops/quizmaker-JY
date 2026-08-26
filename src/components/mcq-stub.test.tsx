import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqStub } from "./mcq-stub";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
	);
});

describe("McqStub", () => {
	it("shows workspace copy and no question-authoring controls", () => {
		render(<McqStub />);

		expect(screen.getByRole("heading", { name: /multiple-choice/i })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /add question/i })).toBeNull();
	});

	it("logs out via POST then navigates to /login", async () => {
		const user = userEvent.setup();
		render(<McqStub />);

		await user.click(screen.getByRole("button", { name: /log out/i }));

		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/logout",
			expect.objectContaining({ method: "POST" }),
		);
		expect(push).toHaveBeenCalledWith("/login");
	});
});
