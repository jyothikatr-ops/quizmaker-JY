import { loginBodySchema } from "@/lib/auth/schemas";
import { jsonError, validationError } from "@/lib/auth/http";
import { timingSafeEqualHex } from "@/lib/auth/timing-safe-equal";
import { findAuthByUsername } from "@/lib/services/user-service";

const INVALID_CREDENTIALS = "Invalid username or password";
const DUMMY_HASH = "0".repeat(64);

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = loginBodySchema.safeParse(body);
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const auth = await findAuthByUsername(parsed.data.username);
		const storedHash = auth?.passwordHash ?? DUMMY_HASH;
		const hashesMatch = timingSafeEqualHex(storedHash, parsed.data.passwordHash);

		if (!auth || !hashesMatch) {
			return jsonError(INVALID_CREDENTIALS, 401);
		}

		return Response.json({
			id: auth.id,
			firstName: auth.firstName,
			lastName: auth.lastName,
			username: auth.username,
			email: auth.email,
		});
	} catch {
		return jsonError("Server error", 500);
	}
}
