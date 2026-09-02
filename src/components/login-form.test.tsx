import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";
import { hashPassword } from "@/lib/auth/hash-password";
import { CURRENT_USER_KEY } from "@/lib/auth/current-user";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

beforeEach(() => {
	vi.clearAllMocks();
	sessionStorage.clear();
	vi.stubGlobal("fetch", vi.fn());
});

async function fillLogin() {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText(/username/i), "ada");
	await user.type(screen.getByLabelText(/^password$/i), "password1");
	return user;
}

describe("LoginForm", () => {
	it("shows username and password fields and a link to register", () => {
		render(<LoginForm />);

		expect(screen.getByLabelText(/username/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
		expect(screen.getByRole("link", { name: /sign up/i })).toHaveProperty(
			"href",
			expect.stringContaining("/register"),
		);
	});

	it("POSTs a passwordHash and navigates to /mcqs on 200", async () => {
		const publicUser = {
			id: "user-ada",
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
		};
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify(publicUser), { status: 200 }),
		);

		render(<LoginForm />);
		const user = await fillLogin();
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		const expectedHash = await hashPassword("password1");
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/login",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					username: "ada",
					passwordHash: expectedHash,
				}),
			}),
		);
		const [, options] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(String(options?.body)).not.toContain("password1");
		expect(push).toHaveBeenCalledWith("/mcqs");
		expect(JSON.parse(sessionStorage.getItem(CURRENT_USER_KEY) ?? "null")).toEqual(publicUser);
	});

	it("shows a generic invalid-credentials message on 401 and does not navigate", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid username or password" }), {
				status: 401,
			}),
		);

		render(<LoginForm />);
		const user = await fillLogin();
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		expect(await screen.findByText(/invalid username or password/i)).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});
});
