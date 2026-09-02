export const CURRENT_USER_KEY = "quizmaker.currentUser";

export type CurrentUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

function isCurrentUser(value: unknown): value is CurrentUser {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record.id === "string" && record.id.length > 0;
}

export function getCurrentUser(): CurrentUser | null {
	if (typeof sessionStorage === "undefined") {
		return null;
	}
	const raw = sessionStorage.getItem(CURRENT_USER_KEY);
	if (!raw) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return isCurrentUser(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function setCurrentUser(user: CurrentUser): void {
	sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

export function clearCurrentUser(): void {
	sessionStorage.removeItem(CURRENT_USER_KEY);
}
