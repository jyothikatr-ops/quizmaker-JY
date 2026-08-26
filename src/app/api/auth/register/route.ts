import { registerBodySchema } from "@/lib/auth/schemas";
import { jsonError, validationError } from "@/lib/auth/http";
import { UserAlreadyExistsError, createUser } from "@/lib/services/user-service";

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = registerBodySchema.safeParse(body);
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const user = await createUser(parsed.data);
		return Response.json(user, { status: 201 });
	} catch (error) {
		if (error instanceof UserAlreadyExistsError) {
			return jsonError(error.message, 409);
		}
		return jsonError("Server error", 500);
	}
}
