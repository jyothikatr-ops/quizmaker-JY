import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(message: string, status: number) {
	return NextResponse.json({ error: message }, { status });
}

export function validationError(error: ZodError) {
	return jsonError(error.issues[0]?.message ?? "Invalid request", 400);
}
