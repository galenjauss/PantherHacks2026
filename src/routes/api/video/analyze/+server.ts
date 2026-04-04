import { json } from "@sveltejs/kit";
import { OPENROUTER_API_KEY } from "$env/static/private";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import promptTemplate from "./prompt.md?raw";
import {
	buildAnalysisSegments,
	DEFAULT_ANALYSIS_SEGMENT_OPTIONS,
	normalizeMs,
	type AnalysisSegmentOptions,
	type AnalysisWordLabel
} from "$lib/video/analysis-segments";

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: OPENROUTER_API_KEY
});

const wordLabelsSchema = z.object({
	labels: z.array(
		z.object({
			index: z.number().describe("The word index (0-based, matching the input order)"),
			category: z.enum(["good", "filler_words", "retake"]).describe(
				"good = default currently selected attempt for a beat, filler_words = um/uh/like/you know/basically/etc, retake = alternate attempt for that beat that can be swapped in later"
			),
			takeId: z
				.string()
				.trim()
				.min(1)
				.nullable()
				.describe(
					"Identifier for the overall take attempt this word belongs to, such as take_1 or take_2. Use null when the word is not part of a script take."
				),
			beatId: z
				.string()
				.trim()
				.min(1)
				.nullable()
				.describe(
					"Identifier for the script beat or line this word belongs to. Reuse the same beatId across different takes of the same intended clip."
				)
		})
	)
});

interface WordInput {
	text: string;
	start: number;
	end: number;
	confidence: number;
}

function validateLabelCoverage(
	labels: AnalysisWordLabel[],
	expectedWordCount: number
): string | null {
	const seen = new Set<number>();

	for (const label of labels) {
		if (!Number.isInteger(label.index)) {
			return "LLM returned a non-integer word index";
		}

		if (label.index < 0 || label.index >= expectedWordCount) {
			return `LLM returned out-of-range index ${label.index}`;
		}

		if (seen.has(label.index)) {
			return `LLM returned duplicate index ${label.index}`;
		}

		seen.add(label.index);
	}

	if (seen.size !== expectedWordCount) {
		return `LLM returned ${seen.size} labels for ${expectedWordCount} words`;
	}

	return null;
}

function canonicalizeLabels(labels: AnalysisWordLabel[]): AnalysisWordLabel[] {
	const takeIds = new Map<string, string>();
	const beatIds = new Map<string, string>();
	let nextTakeNumber = 1;
	let nextBeatNumber = 1;

	return labels.map((label) => {
		const rawTakeId = typeof label.takeId === "string" ? label.takeId.trim() : null;
		const rawBeatId = typeof label.beatId === "string" ? label.beatId.trim() : null;

		let takeId: string | null = null;
		let beatId: string | null = null;

		if (rawTakeId) {
			takeId = takeIds.get(rawTakeId) ?? `take_${nextTakeNumber}`;
			if (!takeIds.has(rawTakeId)) {
				takeIds.set(rawTakeId, takeId);
				nextTakeNumber += 1;
			}
		}

		if (rawBeatId) {
			beatId = beatIds.get(rawBeatId) ?? `beat_${nextBeatNumber}`;
			if (!beatIds.has(rawBeatId)) {
				beatIds.set(rawBeatId, beatId);
				nextBeatNumber += 1;
			}
		}

		return {
			...label,
			takeId,
			beatId
		};
	});
}

function inferTakeIdsFromBeatProgression(labels: AnalysisWordLabel[]): AnalysisWordLabel[] {
	const beatOrder = new Map<string, number>();
	let nextBeatOrder = 1;
	let currentTake = 1;
	let lastBeatOrder: number | null = null;

	function getBeatOrder(beatId: string): number {
		const existing = beatOrder.get(beatId);
		if (existing) return existing;

		const inferredOrder = Number(beatId.replace(/^beat_/, ""));
		const order =
			Number.isInteger(inferredOrder) && inferredOrder > 0 ? inferredOrder : nextBeatOrder;

		beatOrder.set(beatId, order);
		nextBeatOrder = Math.max(nextBeatOrder, order + 1);

		return order;
	}

	return labels.map((label) => {
		if (!label.beatId) {
			return label;
		}

		const currentBeatOrder = getBeatOrder(label.beatId);
		if (lastBeatOrder !== null && currentBeatOrder < lastBeatOrder) {
			currentTake += 1;
		}

		lastBeatOrder = currentBeatOrder;

		return {
			...label,
			takeId: `take_${currentTake}`
		};
	});
}

function normalizeTakeIds(labels: AnalysisWordLabel[]): AnalysisWordLabel[] {
	const takeIds = new Set(
		labels.map((label) => label.takeId).filter((takeId): takeId is string => Boolean(takeId))
	);

	if (takeIds.size > 1) {
		return labels;
	}

	return inferTakeIdsFromBeatProgression(labels);
}

function validateGroupingIds(labels: AnalysisWordLabel[]): string | null {
	for (const label of labels) {
		if (label.category !== "filler_words") {
			if (!label.takeId) {
				return `LLM omitted takeId for ${label.category} index ${label.index}`;
			}

			if (!label.beatId) {
				return `LLM omitted beatId for ${label.category} index ${label.index}`;
			}
		}
	}

	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	const { words, options } = await request.json();

	if (!Array.isArray(words) || words.length === 0) {
		return json({ error: "No words provided" }, { status: 400 });
	}

	const segmentOptions: AnalysisSegmentOptions = {
		deadSpaceThresholdMs: normalizeMs(
			options?.deadSpaceThresholdMs,
			DEFAULT_ANALYSIS_SEGMENT_OPTIONS.deadSpaceThresholdMs,
			{ min: 0, max: 3000 }
		),
		clipEndTrimMs: normalizeMs(options?.clipEndTrimMs, DEFAULT_ANALYSIS_SEGMENT_OPTIONS.clipEndTrimMs, {
			min: 0,
			max: 2000
		})
	};

	const timestampedTranscript = words
		.map((w: { text: string; start: number; end: number; confidence: number }, i: number) =>
			`${i}: [${w.start}-${w.end}] "${w.text}"`
		)
		.join("\n");

	const plainTranscript = words
		.map((w: { text: string }) => w.text)
		.join(" ");

	const tools = {
		label_words: tool({
			description: "Label each word in the transcript with a category, take identifier, and beat identifier.",
			inputSchema: wordLabelsSchema
		})
	};

	const result = await generateText({
		model: openrouter("anthropic/claude-sonnet-4-6"),
		tools,
		toolChoice: { type: "tool", toolName: "label_words" },
		messages: [
			{
				role: "user",
				content: promptTemplate
					.replace("{{plainTranscript}}", plainTranscript)
					.replace("{{timestampedTranscript}}", timestampedTranscript)
					.replace(/\{\{wordCount\}\}/g, String(words.length))
					.replace("{{lastIndex}}", String(words.length - 1))
			}
		]
	});

	const labelCall = result.toolCalls.find(
		(tc) => tc.toolName === "label_words"
	);

	if (!labelCall) {
		return json({ error: "LLM did not return labels" }, { status: 500 });
	}

	const rawLabels = (labelCall as { input: { labels: AnalysisWordLabel[] } }).input.labels;
	const labels = normalizeTakeIds(canonicalizeLabels(rawLabels));
	const validationError = validateLabelCoverage(labels, words.length) ?? validateGroupingIds(labels);

	if (validationError) {
		return json({ error: validationError }, { status: 502 });
	}

	const segments = buildAnalysisSegments(words as WordInput[], labels, segmentOptions);

	return json({ labels, segments });
};
