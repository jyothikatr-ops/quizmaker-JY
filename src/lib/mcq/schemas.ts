import { z } from "zod";

const choiceSchema = z.object({
	text: z.string().trim().min(1, "Each choice needs text."),
	isCorrect: z.boolean(),
});

const choicesSchema = z
	.array(choiceSchema)
	.min(2, "A question must have between 2 and 6 choices")
	.max(6, "A question must have between 2 and 6 choices")
	.refine((choices) => choices.filter((choice) => choice.isCorrect).length === 1, {
		message: "Exactly one choice must be marked correct",
	});

export const createMcqBodySchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	question: z.string().trim().min(1, "Question is required"),
	createdBy: z.string().trim().min(1, "Creator is required"),
	choices: choicesSchema,
});

export const updateMcqBodySchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	question: z.string().trim().min(1, "Question is required"),
	choices: choicesSchema,
});

export const attemptBodySchema = z.object({
	choiceId: z.string().trim().min(1, "choiceId is required"),
});

export type CreateMcqBody = z.infer<typeof createMcqBodySchema>;
export type UpdateMcqBody = z.infer<typeof updateMcqBodySchema>;
export type AttemptBody = z.infer<typeof attemptBodySchema>;
