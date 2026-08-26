import { createUser, UserAlreadyExistsError } from "@/lib/services/user-service";
import { POST } from "./route";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		createUser: vi.fn(),
	};
});

const validBody = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
	passwordHash: "a".repeat(64),
};

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada@school.edu",
	email: "ada@school.edu",
};

function post(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
	it("returns 201 and the public user without a password hash", async () => {
		vi.mocked(createUser).mockResolvedValue(publicUser);

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json).toEqual(publicUser);
		expect(json).not.toHaveProperty("passwordHash");
		expect(createUser).toHaveBeenCalledWith(validBody);
	});

	it("returns 400 with an error object for an invalid body", async () => {
		const response = await post({ ...validBody, email: "not-an-email" });
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json).toEqual({ error: expect.any(String) });
		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 409 when the user already exists", async () => {
		vi.mocked(createUser).mockRejectedValue(new UserAlreadyExistsError());

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json).toEqual({ error: expect.any(String) });
	});

	it("returns 500 when the user service throws unexpectedly", async () => {
		vi.mocked(createUser).mockRejectedValue(new Error("boom"));

		const response = await post(validBody);
		const json = await response.json();

		expect(response.status).toBe(500);
		expect(json).toEqual({ error: expect.any(String) });
	});
});
