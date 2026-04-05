import { json } from "@sveltejs/kit";
import { ASSEMBLYAI_API_KEY } from "$env/static/private";
import type { RequestHandler } from "./$types";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

const ALLOWED_AUDIO_HOSTS = [
	".public.blob.vercel-storage.com",
	".blob.vercel-storage.com"
];

function isAllowedAudioUrl(raw: unknown): raw is string {
	if (typeof raw !== "string" || raw.length === 0) return false;
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:") return false;
		return ALLOWED_AUDIO_HOSTS.some((suffix) => url.hostname.endsWith(suffix));
	} catch {
		return false;
	}
}

async function createTranscript(audioUrl: string) {
	const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
		method: "POST",
		headers: {
			Authorization: ASSEMBLYAI_API_KEY,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			audio_url: audioUrl,
			speech_models: ["universal-3-pro"]
		})
	});

	if (!transcriptRes.ok) {
		const err = await transcriptRes.json().catch(() => ({}));
		return json(
			{ error: "Failed to create transcript", details: err },
			{ status: 502 }
		);
	}

	const transcript = await transcriptRes.json();

	return json(
		{
			transcript_id: transcript.id,
			status: transcript.status
		},
		{ status: 201 }
	);
}

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get("content-type") ?? "";

	// Dev / local fallback: accept a direct multipart upload and push it to AssemblyAI.
	// Used when no Vercel Blob token is available (e.g. teammates not on the Vercel team).
	if (contentType.includes("multipart/form-data")) {
		const formData = await request.formData();
		const file = formData.get("file");

		if (!(file instanceof File)) {
			return json({ error: "No file provided" }, { status: 400 });
		}

		const fileBuffer = await file.arrayBuffer();
		const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
			method: "POST",
			headers: {
				Authorization: ASSEMBLYAI_API_KEY,
				"Content-Type": "application/octet-stream"
			},
			body: fileBuffer
		});

		if (!uploadRes.ok) {
			const err = await uploadRes.json().catch(() => ({}));
			return json(
				{ error: "Failed to upload to AssemblyAI", details: err },
				{ status: 502 }
			);
		}

		const { upload_url } = await uploadRes.json();
		return createTranscript(upload_url);
	}

	// Production path: client uploads to Vercel Blob, then POSTs the blob URL here.
	let payload: { audioUrl?: unknown };
	try {
		payload = (await request.json()) as { audioUrl?: unknown };
	} catch {
		return json({ error: "Expected JSON body or multipart form-data" }, { status: 400 });
	}

	const { audioUrl } = payload;

	if (!isAllowedAudioUrl(audioUrl)) {
		return json(
			{ error: "audioUrl must be an https URL on a Vercel Blob host" },
			{ status: 400 }
		);
	}

	return createTranscript(audioUrl);
};
