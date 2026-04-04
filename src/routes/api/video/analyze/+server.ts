import { json } from "@sveltejs/kit";
import { OPENROUTER_API_KEY } from "$env/static/private";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: OPENROUTER_API_KEY
});

export const POST: RequestHandler = async ({ request }) => {
	const { words } = await request.json();

	if (!Array.isArray(words) || words.length === 0) {
		return json({ error: "No words provided" }, { status: 400 });
	}

	// Build a compact transcript representation for the LLM
	const transcript = words
		.map((w: { text: string; start: number; end: number; confidence: number }) =>
			`[${w.start}-${w.end}] ${w.text}`
		)
		.join("\n");

	const { toolCalls } = await generateText({
		model: openrouter("google/gemini-2.5-flash"),
		tools: {
			categorize_segments: tool({
				description: "Categorize the transcript into time-based segments. Each segment should cover a contiguous range of timestamps and be classified into one of the categories.",
				parameters: z.object({
					segments: z.array(
						z.object({
							start: z.number().describe("Start time in milliseconds"),
							end: z.number().describe("End time in milliseconds"),
							category: z.enum(["good", "filler_words", "retake", "dead_space"]).describe(
								"good = quality content worth keeping, filler_words = um/uh/like/you know/basically/etc, retake = speaker restarts or corrects themselves, dead_space = silence or long pauses between words"
							),
							text: z.string().describe("The transcript text in this segment")
						})
					)
				})
			})
		},
		toolChoice: { type: "tool", toolName: "categorize_segments" },
		messages: [
			{
				role: "user",
				content: `You are a video editor assistant. Analyze the following timestamped transcript and categorize every portion into segments. Each timestamp is in milliseconds.

Categories:
- "good": Quality content that should be kept
- "filler_words": Filler words like um, uh, like, you know, basically, so, right, I mean, etc.
- "retake": Where the speaker restarts a sentence, corrects themselves, or repeats something
- "dead_space": Gaps/silence between words (if the gap between consecutive words is >800ms, mark that gap as dead_space)

Rules:
- Every millisecond of the transcript should be covered — no gaps between segments
- Merge adjacent words that share the same category into a single segment
- Be aggressive about identifying filler words and retakes — these are the most valuable edits
- For dead_space, look at gaps between consecutive word end times and next word start times

Transcript:
${transcript}`
			}
		]
	});

	const categorizeCall = toolCalls.find((tc) => tc.toolName === "categorize_segments");

	if (!categorizeCall) {
		return json({ error: "LLM did not return categorization" }, { status: 500 });
	}

	return json({ segments: categorizeCall.args.segments });
};
