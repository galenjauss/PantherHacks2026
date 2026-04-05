import { json } from "@sveltejs/kit";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { RequestHandler } from "./$types";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as HandleUploadBody;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async () => {
				return {
					allowedContentTypes: ["video/*"],
					maximumSizeInBytes: MAX_UPLOAD_BYTES,
					addRandomSuffix: true
				};
			},
			onUploadCompleted: async () => {
				// Nothing to persist — the client forwards the blob URL to /api/video/transcribe.
			}
		});

		return json(jsonResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Blob upload token request failed";
		return json({ error: message }, { status: 400 });
	}
};
