import { json } from "@sveltejs/kit";
import { ASSEMBLYAI_API_KEY } from "$env/static/private";
import type { RequestHandler } from "./$types";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get("content-type") ?? "";

	if (!contentType.includes("multipart/form-data")) {
		return json({ error: "Expected multipart/form-data" }, { status: 400 });
	}

	const formData = await request.formData();
	const file = formData.get("file");

	if (!(file instanceof File)) {
		return json({ error: "No file provided" }, { status: 400 });
	}

	// 1. Upload file to AssemblyAI
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

	// 2. Submit transcription request
	const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
		method: "POST",
		headers: {
			Authorization: ASSEMBLYAI_API_KEY,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			audio_url: upload_url,
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

	return json({
		transcript_id: transcript.id,
		status: transcript.status
	}, { status: 201 });
};
