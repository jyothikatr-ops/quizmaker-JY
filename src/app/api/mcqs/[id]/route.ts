import { updateMcqBodySchema } from "@/lib/mcq/schemas";
import { jsonError, validationError } from "@/lib/auth/http";
import {
	deleteMcq,
	getMcq,
	InvalidMcqError,
	McqNotFoundError,
	updateMcq,
} from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		const question = await getMcq(id);
		if (!question) {
			return jsonError("Question not found", 404);
		}
		return Response.json(question);
	} catch {
		return jsonError("Server error", 500);
	}
}

export async function PUT(request: Request, context: RouteContext) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = updateMcqBodySchema.safeParse(body);
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const { id } = await context.params;
		const updated = await updateMcq(id, parsed.data);
		return Response.json(updated);
	} catch (error) {
		if (error instanceof InvalidMcqError) {
			return jsonError(error.message, 400);
		}
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Server error", 500);
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	try {
		const { id } = await context.params;
		await deleteMcq(id);
		return Response.json({ ok: true });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Server error", 500);
	}
}
