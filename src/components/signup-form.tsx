"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hashPassword } from "@/lib/auth/hash-password";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function isEmail(value: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const data = new FormData(event.currentTarget);
		const firstName = String(data.get("firstName") ?? "").trim();
		const lastName = String(data.get("lastName") ?? "").trim();
		const username = String(data.get("username") ?? "").trim();
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");
		const confirmPassword = String(data.get("confirmPassword") ?? "");

		if (!firstName || !lastName || !username || !email || !password || !confirmPassword) {
			setError("Fill in all fields.");
			return;
		}
		if (!isEmail(email)) {
			setError("Enter a valid email address.");
			return;
		}
		if (password.length < 8) {
			setError("Password must be at least 8 characters long.");
			return;
		}
		if (password !== confirmPassword) {
			setError("Passwords do not match.");
			return;
		}

		setPending(true);
		try {
			const passwordHash = await hashPassword(password);
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					firstName,
					lastName,
					username,
					email,
					passwordHash,
				}),
			});
			const payload = (await response.json()) as { error?: string };

			if (!response.ok) {
				setError(payload.error ?? "Could not create account.");
				return;
			}

			router.push("/login");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>
					Enter your information below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="firstName">First name</FieldLabel>
							<Input id="firstName" name="firstName" type="text" placeholder="Ada" required />
						</Field>
						<Field>
							<FieldLabel htmlFor="lastName">Last name</FieldLabel>
							<Input id="lastName" name="lastName" type="text" placeholder="Lovelace" required />
						</Field>
						<Field>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input
								id="username"
								name="username"
								type="text"
								placeholder="m@example.com"
								autoComplete="username"
								required
							/>
							<FieldDescription>
								You can use the same value as your email.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="m@example.com"
								autoComplete="email"
								required
							/>
							<FieldDescription>
								We&apos;ll use this to contact you. We will not share your email
								with anyone else.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="new-password"
								required
							/>
							<FieldDescription>Must be at least 8 characters long.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
							<Input
								id="confirm-password"
								name="confirmPassword"
								type="password"
								autoComplete="new-password"
								required
							/>
							<FieldDescription>Please confirm your password.</FieldDescription>
						</Field>
						{error ? (
							<Field>
								<FieldError errors={[{ message: error }]} />
							</Field>
						) : null}
						<FieldGroup>
							<Field>
								<Button type="submit" disabled={pending}>
									Create Account
								</Button>
								<FieldDescription className="px-6 text-center">
									Already have an account? <Link href="/login">Sign in</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
