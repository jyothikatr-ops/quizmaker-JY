"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type DraftChoice = {
	text: string;
	isCorrect: boolean;
};

type McqFormProps =
	| { mode: "create"; id?: undefined }
	| { mode: "edit"; id: string };

function emptyChoices(): DraftChoice[] {
	return [
		{ text: "", isCorrect: false },
		{ text: "", isCorrect: false },
	];
}

export function McqForm(props: McqFormProps) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [question, setQuestion] = useState("");
	const [choices, setChoices] = useState<DraftChoice[]>(emptyChoices);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [notFound, setNotFound] = useState(false);
	const [loadingEdit, setLoadingEdit] = useState(props.mode === "edit");
	const currentUser = getCurrentUser();

	useEffect(() => {
		if (props.mode !== "edit") {
			return;
		}
		let cancelled = false;
		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${props.id}`);
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
					name: string;
					question: string;
					choices: { text: string; isCorrect: boolean }[];
				};
				if (!cancelled) {
					setName(payload.name);
					setQuestion(payload.question);
					setChoices(
						payload.choices.map((choice) => ({
							text: choice.text,
							isCorrect: choice.isCorrect,
						})),
					);
				}
			} catch {
				if (!cancelled) {
					setError("Could not load the question.");
				}
			} finally {
				if (!cancelled) {
					setLoadingEdit(false);
				}
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [props.mode, props.id]);

	const correctIndex = choices.findIndex((choice) => choice.isCorrect);

	function setCorrect(index: string) {
		const selected = Number(index);
		setChoices((current) =>
			current.map((choice, choiceIndex) => ({
				...choice,
				isCorrect: choiceIndex === selected,
			})),
		);
	}

	function addChoice() {
		if (choices.length >= 6) {
			return;
		}
		setChoices((current) => [...current, { text: "", isCorrect: false }]);
	}

	function removeChoice(index: number) {
		if (choices.length <= 2) {
			return;
		}
		setChoices((current) => current.filter((_, choiceIndex) => choiceIndex !== index));
	}

	async function onSave(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);

		const trimmedName = name.trim();
		const trimmedQuestion = question.trim();
		if (!trimmedName) {
			setError("Name is required.");
			return;
		}
		if (!trimmedQuestion) {
			setError("Question is required.");
			return;
		}

		const trimmedChoices = choices.map((choice) => ({
			text: choice.text.trim(),
			isCorrect: choice.isCorrect,
		}));
		if (trimmedChoices.some((choice) => !choice.text)) {
			setError("Each choice needs text.");
			return;
		}
		if (trimmedChoices.length < 2) {
			setError("Add at least two choices.");
			return;
		}
		if (trimmedChoices.filter((choice) => choice.isCorrect).length !== 1) {
			setError("Mark one choice as correct.");
			return;
		}

		if (props.mode === "create" && !currentUser) {
			setError("Log in to create a question.");
			return;
		}

		setPending(true);
		try {
			const response =
				props.mode === "create"
					? await fetch("/api/mcqs", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								name: trimmedName,
								question: trimmedQuestion,
								createdBy: currentUser!.id,
								choices: trimmedChoices,
							}),
						})
					: await fetch(`/api/mcqs/${props.id}`, {
							method: "PUT",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								name: trimmedName,
								question: trimmedQuestion,
								choices: trimmedChoices,
							}),
						});
			const payload = (await response.json()) as { error?: string };
			if (!response.ok) {
				setError(payload.error ?? "Could not save the question.");
				return;
			}
			router.push("/mcqs");
		} catch {
			setError("Could not save the question.");
		} finally {
			setPending(false);
		}
	}

	if (notFound) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Question not found</CardTitle>
				</CardHeader>
				<CardContent>
					<Link href="/mcqs" className={buttonVariants({ variant: "outline" })}>
						Back to questions
					</Link>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<h1>{props.mode === "create" ? "Create question" : "Edit question"}</h1>
				</CardTitle>
			</CardHeader>
			<CardContent>
				{loadingEdit ? <p className="text-sm text-muted-foreground">Loading question...</p> : null}
				{props.mode === "create" && !currentUser ? (
					<p className="mb-4 text-sm text-destructive">
						Log in to create a question.{" "}
						<Link href="/login" className="underline">
							Log in
						</Link>
					</p>
				) : null}
				{!loadingEdit ? (
					<form onSubmit={onSave}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="mcq-name">Name</FieldLabel>
								<Input
									id="mcq-name"
									value={name}
									maxLength={200}
									onChange={(event) => setName(event.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="mcq-question">Question</FieldLabel>
								<Textarea
									id="mcq-question"
									value={question}
									maxLength={2000}
									onChange={(event) => setQuestion(event.target.value)}
								/>
							</Field>
							<RadioGroup
								value={correctIndex >= 0 ? String(correctIndex) : ""}
								onValueChange={setCorrect}
							>
								{choices.map((choice, index) => (
									<div key={index} className="flex items-start gap-3">
										<Field className="flex-1">
											<FieldLabel htmlFor={`choice-${index}`}>Choice {index + 1}</FieldLabel>
											<Input
												id={`choice-${index}`}
												value={choice.text}
												maxLength={500}
												onChange={(event) => {
													const text = event.target.value;
													setChoices((current) =>
														current.map((item, itemIndex) =>
															itemIndex === index ? { ...item, text } : item,
														),
													);
												}}
											/>
										</Field>
										<div className="flex items-center gap-2 pt-6">
											<RadioGroupItem
												value={String(index)}
												id={`correct-${index}`}
											/>
											<FieldLabel htmlFor={`correct-${index}`}>
												Mark choice {index + 1} as correct
											</FieldLabel>
										</div>
										<Button
											type="button"
											variant="outline"
											className="mt-6"
											disabled={choices.length <= 2}
											onClick={() => removeChoice(index)}
										>
											Remove choice
										</Button>
									</div>
								))}
							</RadioGroup>
							{choices.length < 6 ? (
								<Button type="button" variant="outline" onClick={addChoice}>
									Add choice
								</Button>
							) : null}
							{error ? (
								<Field>
									<FieldError errors={[{ message: error }]} />
								</Field>
							) : null}
							<Field className="flex-row">
								<Button type="submit" disabled={pending}>
									Save
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => router.push("/mcqs")}
									disabled={pending}
								>
									Cancel
								</Button>
							</Field>
						</FieldGroup>
					</form>
				) : null}
			</CardContent>
		</Card>
	);
}
