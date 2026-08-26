export async function hashPassword(plaintext: string): Promise<string> {
	const bytes = new TextEncoder().encode(plaintext);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
