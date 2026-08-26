import { findAuthByUsername } from "@/lib/services/user-service";
import { POST } from "./route";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		findAuthByUsername: vi.fn(),
	};
});

const passwordHash = "a".repeat(64);
const otherHash = "b".repeat(64);

const validBody = {
	username: "ada@school.edu",
	passwordHash,
};

const authUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
	passwordHash,
};

function post(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/auth/login", () => {
	it("returns 200 and the public user without a password hash", async () => {
		vi.mocked(findAuthByUsername).mockResolvedValue(authUser);

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({
			id: authUser.id,
			firstName: authUser.firstName,
			lastName: authUser.lastName,
			username: authUser.username,
			email: authUser.email,
		});
		expect(json).not.toHaveProperty("passwordHash");
	});

	it("returns 401 with the same generic message for an unknown user", async () => {
		vi.mocked(findAuthByUsername).mockResolvedValue(null);

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(401);
		expect(json).toEqual({ error: "Invalid username or password" });
	});

	it("returns 401 with the same generic message for a wrong hash", async () => {
		vi.mocked(findAuthByUsername).mockResolvedValue({
			...authUser,
			passwordHash: otherHash,
		});

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(401);
		expect(json).toEqual({ error: "Invalid username or password" });
	});

	it("returns 400 with an error object for an invalid body", async () => {
		const response = await post({ username: "ada" });
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json).toEqual({ error: expect.any(String) });
		expect(findAuthByUsername).not.toHaveBeenCalled();
	});
});
