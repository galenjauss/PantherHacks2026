import { json } from "@sveltejs/kit";
import { list, del } from "@vercel/blob";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes — blobs older than this are stale
const BATCH_SIZE = 100;

export const GET: RequestHandler = async ({ request }) => {
	const secret = env.CRON_SECRET;
	const authHeader = request.headers.get("authorization");
	if (!secret || authHeader !== `Bearer ${secret}`) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const cutoff = Date.now() - MAX_AGE_MS;
	let cursor: string | undefined;
	let deleted = 0;

	do {
		const result = await list({ cursor, limit: BATCH_SIZE });

		const staleUrls = result.blobs
			.filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff)
			.map((blob) => blob.url);

		if (staleUrls.length > 0) {
			await del(staleUrls);
			deleted += staleUrls.length;
		}

		cursor = result.hasMore ? result.cursor : undefined;
	} while (cursor);

	return json({ deleted });
};
