import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	normalizeSubtitlePayload,
	resolveSubtitleRenderMetrics,
	type VideoSubtitleCue,
	type VideoSubtitleLayoutContext,
	type VideoSubtitlePayload,
	type VideoSubtitleStyle
} from "$lib/video/subtitles";

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
	width?: number;
	height?: number;
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

function formatAssTimestamp(ms: number): string {
	const totalMs = Math.max(Math.round(ms), 0);
	const hours = Math.floor(totalMs / 3_600_000);
	const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
	const seconds = Math.floor((totalMs % 60_000) / 1000);
	const centiseconds = Math.floor((totalMs % 1000) / 10);

	return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/\{/g, "(")
		.replace(/\}/g, ")")
		.replace(/\r/g, "")
		.replace(/\n/g, "\\N");
}

function filterPath(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/:/g, "\\:")
		.replace(/,/g, "\\,")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]")
		.replace(/'/g, "\\'");
}

function hexToAssColor(hex: string): string {
	const normalized = hex.replace("#", "").trim();
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
		return "&H00FFFFFF";
	}

	const red = normalized.slice(0, 2);
	const green = normalized.slice(2, 4);
	const blue = normalized.slice(4, 6);
	return `&H00${blue}${green}${red}`.toUpperCase();
}

function buildAssCueText(
	cue: VideoSubtitleCue,
	style: VideoSubtitleStyle,
	activeWordIndex: number | null,
	overlayOnlyActiveWord = false
): string {
	const activeColor = hexToAssColor(style.activeWordColor);
	return cue.words.reduce((result, word, index) => {
		const prefix = word.lineBreakBefore ? "\\N" : word.leadingSpace ? " " : "";
		const text = escapeAssText(word.text);
		const renderedWord = overlayOnlyActiveWord
			? activeWordIndex === index
				? `{\\c${activeColor}}${text}{\\r}`
				: `{\\1a&HFF&\\3a&HFF&}${text}{\\r}`
			: activeWordIndex === index
				? `{\\c${activeColor}}${text}{\\r}`
				: text;

		return `${result}${prefix}${renderedWord}`;
	}, "");
}

function hexToAssAlpha(opacity: number): string {
	const alpha = Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255);
	return `&H${alpha.toString(16).toUpperCase().padStart(2, "0")}`;
}

function serializeAss(payload: VideoSubtitlePayload, context: VideoSubtitleLayoutContext): string {
	const style = payload.style;
	const metrics = resolveSubtitleRenderMetrics(style, context);
	const alignment =
		style.position.verticalAlign === "top"
			? 8
			: style.position.verticalAlign === "middle"
				? 5
				: 2;
	const baseColor = hexToAssColor(style.textColor);
	const outlineColor = hexToAssColor(style.outlineColor);
	const bgAlpha = hexToAssAlpha(style.bgOpacity);
	const bgColor = hexToAssColor(style.bgColor).replace("&H00", `${bgAlpha}`);
	const boldFlag = style.bold ? -1 : 0;
	const events: string[] = [];

	for (const cue of payload.cues) {
		const baseText = buildAssCueText(cue, style, null);
		if (baseText) {
			events.push(
				`Dialogue: 0,${formatAssTimestamp(cue.start)},${formatAssTimestamp(cue.end)},Subtitle,,0,0,0,,${baseText}`
			);
		}

		for (const [wordIndex, word] of cue.words.entries()) {
			if (word.end - word.start < 20) continue;

			const highlightedText = buildAssCueText(cue, style, wordIndex, true);
			if (!highlightedText) continue;

			events.push(
				`Dialogue: 1,${formatAssTimestamp(word.start)},${formatAssTimestamp(word.end)},Subtitle,,0,0,0,,${highlightedText}`
			);
		}
	}

	return [
		"[Script Info]",
		"ScriptType: v4.00+",
		`PlayResX: ${context.width}`,
		`PlayResY: ${context.height}`,
		"WrapStyle: 2",
		"ScaledBorderAndShadow: yes",
		"",
		"[V4+ Styles]",
		"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
		`Style: Subtitle,${style.fontFamily},${metrics.fontSizePx},${baseColor},${baseColor},${outlineColor},${bgColor},${boldFlag},0,0,0,100,100,0,0,3,${style.outlineThickness},0,${alignment},${metrics.marginXpx},${metrics.marginXpx},${metrics.marginYpx},1`,
		"",
		"[Events]",
		"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
		...events
	].join("\n");
}

function buildSubtitleFilter(subtitlesPath: string): string {
	return `[basev]subtitles=filename='${filterPath(subtitlesPath)}'[outv]`;
}

function buildFilterComplex(
	segments: ExportSegment[],
	hasVideo: boolean,
	hasAudio: boolean,
	subtitlesPath: string | null
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

	const concatVideoOutput = hasVideo ? (subtitlesPath ? "[basev]" : "[outv]") : "";
	const concatOutputs = [concatVideoOutput, hasAudio ? "[outa]" : ""].join("");

	filterParts.push(
		`${concatInputs.join("")}concat=n=${segments.length}:v=${hasVideo ? 1 : 0}:a=${hasAudio ? 1 : 0}${concatOutputs}`
	);

	if (hasVideo && subtitlesPath) {
		filterParts.push(buildSubtitleFilter(subtitlesPath));
	}

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
	const rawSubtitles = formData.get("subtitles");

	if (!(file instanceof File)) {
		return json({ error: "No file provided." }, { status: 400 });
	}

	if (typeof rawSegments !== "string") {
		return json({ error: "No segments were provided." }, { status: 400 });
	}

	let segments: ExportSegment[];
	let subtitlePayload: VideoSubtitlePayload | null = null;

	try {
		segments = normalizeSegments(JSON.parse(rawSegments));
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : "Invalid segments payload." },
			{ status: 400 }
		);
	}

	if (typeof rawSubtitles === "string" && rawSubtitles.trim()) {
		try {
			subtitlePayload = normalizeSubtitlePayload(JSON.parse(rawSubtitles));
			if (!subtitlePayload) {
				return json({ error: "Invalid subtitles payload." }, { status: 400 });
			}
		} catch (error) {
			return json(
				{ error: error instanceof Error ? error.message : "Invalid subtitles payload." },
				{ status: 400 }
			);
		}
	} else if (rawSubtitles !== null && rawSubtitles !== undefined) {
		return json({ error: "Subtitles payload must be a JSON string." }, { status: 400 });
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
	const subtitlesPath = join(tempDir, "subtitles.ass");

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
		const videoStream = probeJson.streams?.find((stream) => stream.codec_type === "video") ?? null;
		const hasVideo = Boolean(videoStream);
		const hasAudio = probeJson.streams?.some((stream) => stream.codec_type === "audio") ?? false;

		if (!hasVideo && !hasAudio) {
			return json({ error: "The uploaded media does not contain audio or video streams." }, { status: 400 });
		}

		if (hasVideo && subtitlePayload?.cues.length) {
			const context: VideoSubtitleLayoutContext = {
				width:
					typeof videoStream?.width === "number" && Number.isFinite(videoStream.width) && videoStream.width > 0
						? Math.round(videoStream.width)
						: 1920,
				height:
					typeof videoStream?.height === "number" && Number.isFinite(videoStream.height) && videoStream.height > 0
						? Math.round(videoStream.height)
						: 1080
			};
			await writeFile(subtitlesPath, serializeAss(subtitlePayload, context), "utf8");
		}

		const filterComplex = buildFilterComplex(
			segments,
			hasVideo,
			hasAudio,
			hasVideo && subtitlePayload?.cues.length ? subtitlesPath : null
		);
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
