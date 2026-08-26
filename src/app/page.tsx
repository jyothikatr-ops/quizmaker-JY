import { redirect } from "next/navigation";

export const homeDestination = "/login";

export default function Home() {
	redirect(homeDestination);
}
