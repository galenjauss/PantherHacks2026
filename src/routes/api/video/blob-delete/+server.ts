import { json } from "@sveltejs/kit";
import { del } from "@vercel/blob";
import { isAllowedBlobUrl } from "$lib/server/blob-url";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	let payload: { url?: unknown };
	try {
		payload = (await request.json()) as { url?: unknown };
	} catch {
		return json({ error: "Expected JSON body" }, { status: 400 });
	}

	const { url } = payload;

	if (!isAllowedBlobUrl(url)) {
		return json({ error: "url must be an https URL on a Vercel Blob host" }, { status: 400 });
	}

	try {
		await del(url);
	} catch {
		// Treat "not found" or any deletion error as success — idempotent cleanup.
	}

	return new Response(null, { status: 204 });
};
