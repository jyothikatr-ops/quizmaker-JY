import { attemptBodySchema } from "@/lib/mcq/schemas";
import { jsonError, validationError } from "@/lib/auth/http";
import {
	ChoiceNotFoundError,
	createAttempt,
	listAttempts,
	McqNotFoundError,
} from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		const attempts = await listAttempts(id);
		return Response.json({ attempts });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Server error", 500);
	}
}

export async function POST(request: Request, context: RouteContext) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = attemptBodySchema.safeParse(body);
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const { id } = await context.params;
		const attempt = await createAttempt(id, parsed.data.choiceId);
		return Response.json(attempt, { status: 201 });
	} catch (error) {
		if (error instanceof McqNotFoundError || error instanceof ChoiceNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Server error", 500);
	}
}
