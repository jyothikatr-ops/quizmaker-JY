import { createMcqBodySchema } from "@/lib/mcq/schemas";
import { jsonError, validationError } from "@/lib/auth/http";
import { createMcq, InvalidMcqError, listMcqs } from "@/lib/services/mcq-service";

export async function GET() {
	try {
		const mcqs = await listMcqs();
		return Response.json({ mcqs });
	} catch {
		return jsonError("Server error", 500);
	}
}

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = createMcqBodySchema.safeParse(body);
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	try {
		const created = await createMcq(parsed.data);
		return Response.json(created, { status: 201 });
	} catch (error) {
		if (error instanceof InvalidMcqError) {
			return jsonError(error.message, 400);
		}
		return jsonError("Server error", 500);
	}
}
