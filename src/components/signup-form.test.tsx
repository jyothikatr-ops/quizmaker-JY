import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupForm } from "./signup-form";
import { hashPassword } from "@/lib/auth/hash-password";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", vi.fn());
});

async function fillSignup(
	user: ReturnType<typeof userEvent.setup>,
	overrides?: {
		email?: string;
		password?: string;
		confirm?: string;
		username?: string;
	},
) {
	const email = overrides?.email ?? "ada@school.edu";
	const username = overrides?.username ?? email;
	const password = overrides?.password ?? "password1";
	const confirm = overrides?.confirm ?? password;

	await user.type(screen.getByLabelText(/first name/i), "Ada");
	await user.type(screen.getByLabelText(/last name/i), "Lovelace");
	await user.type(screen.getByLabelText(/username/i), username);
	await user.type(screen.getByLabelText(/^email$/i), email);
	await user.type(screen.getByLabelText(/^password$/i), password);
	await user.type(screen.getByLabelText(/confirm password/i), confirm);
}

describe("SignupForm", () => {
	it("shows the register fields and a link to login", () => {
		render(<SignupForm />);

		expect(screen.getByLabelText(/first name/i)).toBeTruthy();
		expect(screen.getByLabelText(/last name/i)).toBeTruthy();
		expect(screen.getByLabelText(/username/i)).toBeTruthy();
		expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
		expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
		expect(screen.getByRole("link", { name: /sign in/i })).toHaveProperty(
			"href",
			expect.stringContaining("/login"),
		);
	});

	it("does not call fetch when client validation fails", async () => {
		const user = userEvent.setup();
		render(<SignupForm />);

		await user.click(screen.getByRole("button", { name: /create account/i }));
		expect(fetch).not.toHaveBeenCalled();

		await fillSignup(user, { email: "not-an-email" });
		await user.click(screen.getByRole("button", { name: /create account/i }));
		expect(fetch).not.toHaveBeenCalled();

		await user.clear(screen.getByLabelText(/^email$/i));
		await user.clear(screen.getByLabelText(/^password$/i));
		await user.clear(screen.getByLabelText(/confirm password/i));
		await user.type(screen.getByLabelText(/^email$/i), "ada@school.edu");
		await user.type(screen.getByLabelText(/^password$/i), "short");
		await user.type(screen.getByLabelText(/confirm password/i), "short");
		await user.click(screen.getByRole("button", { name: /create account/i }));
		expect(fetch).not.toHaveBeenCalled();

		await user.clear(screen.getByLabelText(/^password$/i));
		await user.clear(screen.getByLabelText(/confirm password/i));
		await user.type(screen.getByLabelText(/^password$/i), "password1");
		await user.type(screen.getByLabelText(/confirm password/i), "password2");
		await user.click(screen.getByRole("button", { name: /create account/i }));
		expect(fetch).not.toHaveBeenCalled();
		expect(await screen.findByRole("alert")).toBeTruthy();
	});

	it("allows username equal to email and POSTs passwordHash, not plaintext", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "1" }), { status: 201 }),
		);

		const user = userEvent.setup();
		render(<SignupForm />);
		await fillSignup(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		const expectedHash = await hashPassword("password1");
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/register",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					firstName: "Ada",
					lastName: "Lovelace",
					username: "ada@school.edu",
					email: "ada@school.edu",
					passwordHash: expectedHash,
				}),
			}),
		);
		const [, options] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(String(options?.body)).not.toContain("password1");
		expect(push).toHaveBeenCalledWith("/login");
	});

	it("shows an API error on 409 and does not navigate", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: "Username or email already exists" }), {
				status: 409,
			}),
		);

		const user = userEvent.setup();
		render(<SignupForm />);
		await fillSignup(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(await screen.findByText(/username or email already exists/i)).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});
});
