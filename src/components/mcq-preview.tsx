"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type PreviewChoice = {
	id: string;
	text: string;
	position: number;
};

type PreviewQuestion = {
	id: string;
	name: string;
	question: string;
	choices: PreviewChoice[];
};

export function McqPreview({ id }: { id: string }) {
	const [question, setQuestion] = useState<PreviewQuestion | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState("");
	const [result, setResult] = useState<"Correct" | "Incorrect" | null>(null);
	const [pending, setPending] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${id}`);
				if (response.status === 404) {
					if (!cancelled) {
						setNotFound(true);
					}
					return;
				}
				if (!response.ok) {
					if (!cancelled) {
						setError("Could not load the question.");
					}
					return;
				}
				const payload = (await response.json()) as {
					id: string;
					name: string;
					question: string;
					choices: { id: string; text: string; position: number; isCorrect?: boolean }[];
				};
				if (!cancelled) {
					setQuestion({
						id: payload.id,
						name: payload.name,
						question: payload.question,
						choices: payload.choices.map(({ id: choiceId, text, position }) => ({
							id: choiceId,
							text,
							position,
						})),
					});
				}
			} catch {
				if (!cancelled) {
					setError("Could not load the question.");
				}
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [id]);

	async function onSubmit() {
		if (!selectedId || result) {
			return;
		}
		setError(null);
		setPending(true);
		try {
			const response = await fetch(`/api/mcqs/${id}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choiceId: selectedId }),
			});
			const payload = (await response.json()) as { isCorrect?: boolean; error?: string };
			if (!response.ok) {
				setError(payload.error ?? "Could not submit the answer.");
				return;
			}
			setResult(payload.isCorrect ? "Correct" : "Incorrect");
		} catch {
			setError("Could not submit the answer.");
		} finally {
			setPending(false);
		}
	}

	if (notFound) {
		return (
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle>Question not found</CardTitle>
				</CardHeader>
				<CardContent>
					<Button variant="outline" render={<Link href="/mcqs" />}>
						Back to questions
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle>
					<h1>{question?.name ?? "Preview"}</h1>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{question ? <p>{question.question}</p> : <p className="text-sm text-muted-foreground">Loading question...</p>}
				{question ? (
					<RadioGroup
						value={selectedId}
						onValueChange={result ? undefined : setSelectedId}
					>
						{question.choices.map((choice) => (
							<div key={choice.id} className="flex items-center gap-2">
								<RadioGroupItem value={choice.id} id={`preview-${choice.id}`} />
								<FieldLabel htmlFor={`preview-${choice.id}`}>{choice.text}</FieldLabel>
							</div>
						))}
					</RadioGroup>
				) : null}
				{result ? <p className="font-medium">{result}</p> : null}
				{error ? (
					<Field>
						<FieldError errors={[{ message: error }]} />
					</Field>
				) : null}
				<div className="flex gap-2">
					<Button
						type="button"
						onClick={onSubmit}
						disabled={!selectedId || pending || result !== null}
					>
						Submit answer
					</Button>
					<Button variant="outline" render={<Link href="/mcqs" />}>
						Back to questions
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
