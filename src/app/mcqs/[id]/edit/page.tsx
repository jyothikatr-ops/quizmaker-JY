import { McqForm } from "@/components/mcq-form";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	return (
		<div className="flex min-h-svh w-full justify-center p-6 md:p-10">
			<div className="w-full max-w-2xl">
				<McqForm mode="edit" id={id} />
			</div>
		</div>
	);
}
