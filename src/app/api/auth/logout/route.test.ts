import { createUser, findAuthByUsername } from "@/lib/services/user-service";
import { POST } from "./route";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		createUser: vi.fn(),
		findAuthByUsername: vi.fn(),
	};
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/auth/logout", () => {
	it("returns 200 { ok: true } without calling the user service", async () => {
		const response = await POST(
			new Request("http://localhost/api/auth/logout", { method: "POST" }),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({ ok: true });
		expect(createUser).not.toHaveBeenCalled();
		expect(findAuthByUsername).not.toHaveBeenCalled();
	});
});
