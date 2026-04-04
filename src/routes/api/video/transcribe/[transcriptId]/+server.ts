import { json } from "@sveltejs/kit";
import { ASSEMBLYAI_API_KEY } from "$env/static/private";
import type { RequestHandler } from "./$types";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export const GET: RequestHandler = async ({ params }) => {
	const { transcriptId } = params;

	const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
		headers: {
			Authorization: ASSEMBLYAI_API_KEY
		}
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		return json(
			{ error: "Failed to fetch transcript", details: err },
			{ status: res.status }
		);
	}

	const transcript = await res.json();

	return json({
		id: transcript.id,
		status: transcript.status,
		text: transcript.text,
		error: transcript.error,
		audio_duration: transcript.audio_duration,
		confidence: transcript.confidence,
		words: transcript.words
	});
};
