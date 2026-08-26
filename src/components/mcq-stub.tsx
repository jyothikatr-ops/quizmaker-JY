"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function McqStub() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onLogout() {
		setError(null);
		setPending(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} catch {
			setError("Could not log out. Please try again.");
			setPending(false);
		}
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>
					<h1>Multiple-choice questions</h1>
				</CardTitle>
				<CardDescription>
					This is a placeholder for the shared test bank. Question authoring comes in a
					later phase.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{error ? <p className="text-sm text-destructive">{error}</p> : null}
				<Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
					Log out
				</Button>
			</CardContent>
		</Card>
	);
}
