"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";
import { clearCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type McqListItem = {
	id: string;
	name: string;
	question: string;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

async function fetchMcqs(): Promise<{ items: McqListItem[] } | { error: string }> {
	try {
		const response = await fetch("/api/mcqs");
		if (!response.ok) {
			return { error: "Could not load questions." };
		}
		const payload = (await response.json()) as { mcqs?: McqListItem[] };
		return { items: payload.mcqs ?? [] };
	} catch {
		return { error: "Could not load questions." };
	}
}

export function McqList() {
	const router = useRouter();
	const [mcqs, setMcqs] = useState<McqListItem[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [logoutError, setLogoutError] = useState<string | null>(null);
	const [pendingLogout, setPendingLogout] = useState(false);
	const [toDelete, setToDelete] = useState<McqListItem | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState(false);

	function applyMcqs(result: Awaited<ReturnType<typeof fetchMcqs>>) {
		if ("error" in result) {
			setMcqs(null);
			setLoadError(result.error);
			return;
		}
		setLoadError(null);
		setMcqs(result.items);
	}

	async function load() {
		applyMcqs(await fetchMcqs());
	}

	useEffect(() => {
		let cancelled = false;
		async function initialLoad() {
			const result = await fetchMcqs();
			if (!cancelled) {
				applyMcqs(result);
			}
		}
		void initialLoad();
		return () => {
			cancelled = true;
		};
	}, []);

	async function onLogout() {
		setLogoutError(null);
		setPendingLogout(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			clearCurrentUser();
			router.push("/login");
		} catch {
			setLogoutError("Could not log out. Please try again.");
			setPendingLogout(false);
		}
	}

	async function onConfirmDelete() {
		if (!toDelete) {
			return;
		}
		setDeleteError(null);
		setPendingDelete(true);
		try {
			const response = await fetch(`/api/mcqs/${toDelete.id}`, { method: "DELETE" });
			if (!response.ok) {
				const payload = (await response.json()) as { error?: string };
				setDeleteError(payload.error ?? "Could not delete the question.");
				setPendingDelete(false);
				return;
			}
			setToDelete(null);
			setPendingDelete(false);
			await load();
		} catch {
			setDeleteError("Could not delete the question.");
			setPendingDelete(false);
		}
	}

	const createLink = (
		<Button render={<Link href="/mcqs/new" />}>Create question</Button>
	);

	return (
		<div className="flex w-full max-w-5xl flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Multiple-choice questions</h1>
				<div className="flex items-center gap-2">
					{createLink}
					<Button type="button" variant="outline" onClick={onLogout} disabled={pendingLogout}>
						Log out
					</Button>
				</div>
			</div>
			{logoutError ? <p className="text-sm text-destructive">{logoutError}</p> : null}
			{loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
			{mcqs === null && !loadError ? (
				<p className="text-sm text-muted-foreground">Loading questions...</p>
			) : null}
			{mcqs && mcqs.length === 0 ? (
				<div className="flex flex-col items-start gap-3 rounded-xl border p-6">
					<p className="text-sm text-muted-foreground">No questions yet.</p>
					{createLink}
				</div>
			) : null}
			{mcqs && mcqs.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Question</TableHead>
							<TableHead className="w-16">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{mcqs.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="font-medium whitespace-normal">{item.name}</TableCell>
								<TableCell className="max-w-xl whitespace-normal">
									<p className="line-clamp-2">{item.question}</p>
								</TableCell>
								<TableCell>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button variant="ghost" size="icon" aria-label="Open actions" />
											}
										>
											<EllipsisVertical />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={() => router.push(`/mcqs/${item.id}/edit`)}>
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => router.push(`/mcqs/${item.id}/preview`)}
											>
												Preview
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													setDeleteError(null);
													setToDelete(item);
												}}
											>
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}
			<Dialog
				open={toDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						setToDelete(null);
						setDeleteError(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete question?</DialogTitle>
						<DialogDescription>
							This will permanently delete <strong>{toDelete?.name}</strong>.
						</DialogDescription>
					</DialogHeader>
					{deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setToDelete(null)}
							disabled={pendingDelete}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={onConfirmDelete}
							disabled={pendingDelete}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
