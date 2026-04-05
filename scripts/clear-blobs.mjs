#!/usr/bin/env node

/**
 * One-off script to delete ALL existing Vercel Blobs.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... node scripts/clear-blobs.mjs
 *
 * Or if your .env already has the token:
 *   npx dotenv -e .env -- node scripts/clear-blobs.mjs
 */

import { list, del } from "@vercel/blob";

const BATCH_SIZE = 100;

async function main() {
	if (!process.env.BLOB_READ_WRITE_TOKEN) {
		console.error("BLOB_READ_WRITE_TOKEN is required. Set it as an env var or use dotenv.");
		process.exit(1);
	}

	let cursor;
	let deleted = 0;

	do {
		const result = await list({ cursor, limit: BATCH_SIZE });

		if (result.blobs.length === 0) break;

		const urls = result.blobs.map((b) => b.url);
		await del(urls);
		deleted += urls.length;

		console.log(`Deleted ${deleted} blobs so far...`);

		cursor = result.hasMore ? result.cursor : undefined;
	} while (cursor);

	console.log(`Done. Deleted ${deleted} blob(s) total.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
