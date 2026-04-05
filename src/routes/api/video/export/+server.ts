import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

interface ExportSegment {
	start: number;
	end: number;
}

interface ProbeStream {
	codec_type?: string;
}

function isSegment(value: unknown): value is ExportSegment {
	if (!value || typeof value !== "object") return false;

	const candidate = value as Record<string, unknown>;
	return typeof candidate.start === "number" && typeof candidate.end === "number";
}

function normalizeSegments(rawSegments: unknown): ExportSegment[] {
	if (!Array.isArray(rawSegments)) {
		throw new Error("Segments payload must be an array.");
	}

	return rawSegments
		.filter(isSegment)
		.map((segment) => ({
			start: Math.max(segment.start, 0),
			end: Math.max(segment.end, 0)
		}))
		.filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end))
		.filter((segment) => segment.end - segment.start >= 16);
}

function formatSeconds(ms: number): string {
	return (ms / 1000).toFixed(3);
}

function buildFilterComplex(
	segments: ExportSegment[],
	hasVideo: boolean,
	hasAudio: boolean
): string {
	const filterParts: string[] = [];
	const concatInputs: string[] = [];

	for (const [index, segment] of segments.entries()) {
		if (hasVideo) {
			filterParts.push(
				`[0:v:0]trim=start=${formatSeconds(segment.start)}:end=${formatSeconds(segment.end)},setpts=PTS-STARTPTS[v${index}]`
			);
			concatInputs.push(`[v${index}]`);
		}

		if (hasAudio) {
			filterParts.push(
				`[0:a:0]atrim=start=${formatSeconds(segment.start)}:end=${formatSeconds(segment.end)},asetpts=PTS-STARTPTS[a${index}]`
			);
			concatInputs.push(`[a${index}]`);
		}
	}

	const concatOutputs = [
		hasVideo ? "[outv]" : "",
		hasAudio ? "[outa]" : ""
	].join("");

	filterParts.push(
		`${concatInputs.join("")}concat=n=${segments.length}:v=${hasVideo ? 1 : 0}:a=${hasAudio ? 1 : 0}${concatOutputs}`
	);

	return filterParts.join(";");
}

async function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
	return await new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"]
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}

			reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
		});
	});
}

function safeOutputName(fileName: string | null, fallbackName: string): string {
	const baseName = (fileName || fallbackName).replace(/\.[^.]+$/, "") || "snip-export";
	return `${baseName.replace(/[^a-zA-Z0-9-_]+/g, "-")}-snip.mp4`;
}

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get("content-type") ?? "";

	if (!contentType.includes("multipart/form-data")) {
		return json({ error: "Expected multipart/form-data." }, { status: 400 });
	}

	const formData = await request.formData();
	const file = formData.get("file");
	const rawSegments = formData.get("segments");
	const requestedFileName = formData.get("fileName");

	if (!(file instanceof File)) {
		return json({ error: "No file provided." }, { status: 400 });
	}

	if (typeof rawSegments !== "string") {
		return json({ error: "No segments were provided." }, { status: 400 });
	}

	let segments: ExportSegment[];

	try {
		segments = normalizeSegments(JSON.parse(rawSegments));
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : "Invalid segments payload." },
			{ status: 400 }
		);
	}

	if (segments.length === 0) {
		return json({ error: "No non-empty playback segments were provided." }, { status: 400 });
	}

	const tempDir = await mkdtemp(join(tmpdir(), "snip-export-"));
	const inputPath = join(tempDir, `input${extname(file.name) || ".mp4"}`);
	const outputName = safeOutputName(
		typeof requestedFileName === "string" ? requestedFileName : file.name,
		file.name
	);
	const outputPath = join(tempDir, outputName);

	try {
		await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

		const probe = await runCommand("ffprobe", [
			"-v",
			"error",
			"-print_format",
			"json",
			"-show_streams",
			inputPath
		]);
		const probeJson = JSON.parse(probe.stdout) as { streams?: ProbeStream[] };
		const hasVideo = probeJson.streams?.some((stream) => stream.codec_type === "video") ?? false;
		const hasAudio = probeJson.streams?.some((stream) => stream.codec_type === "audio") ?? false;

		if (!hasVideo && !hasAudio) {
			return json({ error: "The uploaded media does not contain audio or video streams." }, { status: 400 });
		}

		const filterComplex = buildFilterComplex(segments, hasVideo, hasAudio);
		const ffmpegArgs = [
			"-y",
			"-i",
			inputPath,
			"-filter_complex",
			filterComplex
		];

		if (hasVideo) {
			ffmpegArgs.push(
				"-map",
				"[outv]",
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-pix_fmt",
				"yuv420p"
			);
		}

		if (hasAudio) {
			ffmpegArgs.push("-map", "[outa]", "-c:a", "aac", "-b:a", "192k");
		}

		ffmpegArgs.push("-movflags", "+faststart", outputPath);

		await runCommand("ffmpeg", ffmpegArgs);

		const outputBuffer = await readFile(outputPath);

		return new Response(outputBuffer, {
			status: 200,
			headers: {
				"Content-Type": "video/mp4",
				"Content-Length": String(outputBuffer.byteLength),
				"Content-Disposition": `attachment; filename="${outputName}"`
			}
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : "Failed to export MP4." },
			{ status: 500 }
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
};
