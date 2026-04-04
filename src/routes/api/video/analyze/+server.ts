import { json } from "@sveltejs/kit";
import { OPENROUTER_API_KEY } from "$env/static/private";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import promptTemplate from "./prompt.md?raw";

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

interface Segment {
	start: number;
	end: number;
	category: "good" | "filler_words" | "retake" | "dead_space";
	text: string;
}

function buildSegments(words: WordInput[], labels: { index: number; category: "good" | "filler_words" | "retake" }[]): Segment[] {
	const labelMap = new Map<number, "good" | "filler_words" | "retake">();
	for (const l of labels) {
		labelMap.set(l.index, l.category);
	}

	const segments: Segment[] = [];
	const DEAD_SPACE_THRESHOLD = 300; // ms gap to count as dead space

	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		const category = labelMap.get(i) ?? "good";

		// Insert dead_space if there's a gap before this word
		if (i > 0) {
			const prevEnd = words[i - 1].end;
			const gap = word.start - prevEnd;
			if (gap > DEAD_SPACE_THRESHOLD) {
				// Try to merge with previous segment if it was also dead_space
				const last = segments[segments.length - 1];
				if (last && last.category === "dead_space") {
					last.end = word.start;
				} else {
					segments.push({ start: prevEnd, end: word.start, category: "dead_space", text: "" });
				}
			}
		}

		// Try to merge with previous segment if same category
		const last = segments[segments.length - 1];
		if (last && last.category === category) {
			last.end = word.end;
			last.text += " " + word.text;
		} else {
			segments.push({ start: word.start, end: word.end, category, text: word.text });
		}
	}

	return segments;
}

export const POST: RequestHandler = async ({ request }) => {
	const { words } = await request.json();

	if (!Array.isArray(words) || words.length === 0) {
		return json({ error: "No words provided" }, { status: 400 });
	}

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
	const segments = buildSegments(words as WordInput[], labels);

	return json({ segments });
};
