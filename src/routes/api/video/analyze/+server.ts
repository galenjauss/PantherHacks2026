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
	type AnalysisSegmentOptions
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
				"good = quality content worth keeping, filler_words = um/uh/like/you know/basically/etc, retake = speaker restarts or corrects themselves"
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
	labels: { index: number; category: "good" | "filler_words" | "retake" }[],
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
			description: "Label each word in the transcript with a category.",
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

	const { labels } = (labelCall as { input: { labels: { index: number; category: "good" | "filler_words" | "retake" }[] } }).input;
	const validationError = validateLabelCoverage(labels, words.length);

	if (validationError) {
		return json({ error: validationError }, { status: 502 });
	}

	const segments = buildAnalysisSegments(words as WordInput[], labels, segmentOptions);

	return json({ labels, segments });
};
