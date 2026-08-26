import { z } from "zod";

const passwordHashSchema = z
	.string()
	.regex(/^[0-9a-f]{64}$/, "passwordHash must be a 64-character lowercase hex digest");

export const registerBodySchema = z.object({
	firstName: z.string().trim().min(1, "firstName is required"),
	lastName: z.string().trim().min(1, "lastName is required"),
	username: z.string().trim().min(1, "username is required"),
	email: z.email("email must be a valid email address"),
	passwordHash: passwordHashSchema,
});

export const loginBodySchema = z.object({
	username: z.string().trim().min(1, "username is required"),
	passwordHash: passwordHashSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
