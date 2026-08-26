"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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

export function LoginForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const data = new FormData(event.currentTarget);
		const username = String(data.get("username") ?? "").trim();
		const password = String(data.get("password") ?? "");

		if (!username || !password) {
			setError("Enter your username and password.");
			return;
		}

		setPending(true);
		try {
			const passwordHash = await hashPassword(password);
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, passwordHash }),
			});
			const payload = (await response.json()) as { error?: string };

			if (!response.ok) {
				setError(payload.error ?? "Invalid username or password");
				return;
			}

			router.push("/mcqs");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>
						Enter your username below to login to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit}>
						<FieldGroup>
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
							</Field>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									autoComplete="current-password"
									required
								/>
							</Field>
							{error ? (
								<Field>
									<FieldError errors={[{ message: error }]} />
								</Field>
							) : null}
							<Field>
								<Button type="submit" disabled={pending}>
									Login
								</Button>
								<FieldDescription className="text-center">
									Don&apos;t have an account? <Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
