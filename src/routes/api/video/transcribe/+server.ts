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

export const POST: RequestHandler = async ({ request }) => {
	let payload: { audioUrl?: unknown };
	try {
		payload = (await request.json()) as { audioUrl?: unknown };
	} catch {
		return json({ error: "Expected JSON body" }, { status: 400 });
	}

	const { audioUrl } = payload;

	if (!isAllowedAudioUrl(audioUrl)) {
		return json(
			{ error: "audioUrl must be an https URL on a Vercel Blob host" },
			{ status: 400 }
		);
	}

	// Submit transcription request directly — AssemblyAI will fetch the audio by URL.
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
};
