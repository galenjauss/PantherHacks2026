import { json } from "@sveltejs/kit";
import { OPENROUTER_API_KEY } from "$env/static/private";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { RequestHandler } from "./$types";
import promptTemplate from "./prompt.md?raw";
import type {
	AnalyzeTranscriptResponse,
	WordSemanticLabel,
	WordStatus
} from "$lib/types/autocut";

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: OPENROUTER_API_KEY
});

interface WordInput {
	text: string;
	start: number;
	end: number;
	confidence: number;
}

function normalizeId(value: unknown): string | null {
	if (typeof value !== "string") return null;

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeOrder(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;

	return Math.max(1, Math.round(value));
}

function validateLabelCoverage(
	labels: WordSemanticLabel[],
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

function validateSemanticIds(labels: WordSemanticLabel[]): string | null {
	for (const label of labels) {
		const requiresSemanticIds = label.status === "selected" || label.status === "alternate";

		if (requiresSemanticIds) {
			if (!label.lineId) {
				return `LLM omitted lineId for ${label.status} index ${label.index}`;
			}

			if (typeof label.lineOrder !== "number") {
				return `LLM omitted lineOrder for ${label.status} index ${label.index}`;
			}

			if (!label.slotId) {
				return `LLM omitted slotId for ${label.status} index ${label.index}`;
			}

			if (typeof label.slotOrder !== "number") {
				return `LLM omitted slotOrder for ${label.status} index ${label.index}`;
			}

			if (!label.variantId) {
				return `LLM omitted variantId for ${label.status} index ${label.index}`;
			}
		}

		if (label.slotId && !label.lineId) {
			return `LLM returned slotId without lineId for index ${label.index}`;
		}

		if (label.variantId && !label.slotId) {
			return `LLM returned variantId without slotId for index ${label.index}`;
		}

		if (label.lockId && !label.variantId) {
			return `LLM returned lockId without variantId for index ${label.index}`;
		}
	}

	return null;
}

function canonicalizeLabels(labels: WordSemanticLabel[]): WordSemanticLabel[] {
	const normalized = labels.map((label) => ({
		index: label.index,
		lineId: normalizeId(label.lineId),
		lineOrder: normalizeOrder(label.lineOrder),
		slotId: normalizeId(label.slotId),
		slotOrder: normalizeOrder(label.slotOrder),
		variantId: normalizeId(label.variantId),
		lockId: normalizeId(label.lockId),
		status: label.status
	}));
	const lineSeeds = new Map<string, { order: number | null; firstIndex: number }>();
	const slotSeeds = new Map<
		string,
		{
			rawLineId: string;
			rawSlotId: string;
			rawSlotOrder: number | null;
			firstIndex: number;
		}
	>();
	const variantSeeds = new Map<
		string,
		{
			rawSlotKey: string;
			rawVariantId: string;
			firstIndex: number;
			status: WordStatus;
		}
	>();
	const lockSeeds = new Map<
		string,
		{
			rawVariantKey: string;
			rawLockId: string;
			firstIndex: number;
		}
	>();

	for (const label of normalized) {
		if (label.lineId) {
			const existing = lineSeeds.get(label.lineId);
			lineSeeds.set(label.lineId, {
				order:
					existing?.order === null
						? label.lineOrder
						: label.lineOrder === null
							? existing?.order ?? null
							: Math.min(existing?.order ?? label.lineOrder, label.lineOrder),
				firstIndex: Math.min(existing?.firstIndex ?? label.index, label.index)
			});
		}

		if (label.lineId && label.slotId) {
			const slotKey = `${label.lineId}::${label.slotId}`;
			const existing = slotSeeds.get(slotKey);
			slotSeeds.set(slotKey, {
				rawLineId: label.lineId,
				rawSlotId: label.slotId,
				rawSlotOrder:
					existing?.rawSlotOrder === null
						? label.slotOrder
						: label.slotOrder === null
							? existing?.rawSlotOrder ?? null
							: Math.min(existing?.rawSlotOrder ?? label.slotOrder, label.slotOrder),
				firstIndex: Math.min(existing?.firstIndex ?? label.index, label.index)
			});

			if (label.variantId) {
				const variantKey = `${slotKey}::${label.variantId}`;
				const existingVariant = variantSeeds.get(variantKey);
				variantSeeds.set(variantKey, {
					rawSlotKey: slotKey,
					rawVariantId: label.variantId,
					firstIndex: Math.min(existingVariant?.firstIndex ?? label.index, label.index),
					status:
						existingVariant?.status === "selected" || label.status === "selected"
							? "selected"
							: label.status
				});

				if (label.lockId) {
					const lockKey = `${variantKey}::${label.lockId}`;
					const existingLock = lockSeeds.get(lockKey);
					lockSeeds.set(lockKey, {
						rawVariantKey: variantKey,
						rawLockId: label.lockId,
						firstIndex: Math.min(existingLock?.firstIndex ?? label.index, label.index)
					});
				}
			}
		}
	}

	const canonicalLineMap = new Map(
		[...lineSeeds.entries()]
			.sort(
				(left, right) =>
					(left[1].order ?? Number.MAX_SAFE_INTEGER) -
						(right[1].order ?? Number.MAX_SAFE_INTEGER) ||
					left[1].firstIndex - right[1].firstIndex
			)
			.map(([rawLineId], index) => [
				rawLineId,
				{
					lineId: `line_${index + 1}`,
					lineOrder: index + 1
				}
			])
	);
	const slotCountsByLine = new Map<string, number>();
	const canonicalSlotMap = new Map(
		[...slotSeeds.entries()]
			.sort((left, right) => {
				const leftLine = canonicalLineMap.get(left[1].rawLineId);
				const rightLine = canonicalLineMap.get(right[1].rawLineId);

				return (
					(leftLine?.lineOrder ?? Number.MAX_SAFE_INTEGER) -
						(rightLine?.lineOrder ?? Number.MAX_SAFE_INTEGER) ||
					(left[1].rawSlotOrder ?? Number.MAX_SAFE_INTEGER) -
						(right[1].rawSlotOrder ?? Number.MAX_SAFE_INTEGER) ||
					left[1].firstIndex - right[1].firstIndex
				);
			})
			.map(([slotKey, seed], index) => {
				const line = canonicalLineMap.get(seed.rawLineId);
				const currentCount = slotCountsByLine.get(seed.rawLineId) ?? 0;
				const slotOrder = currentCount + 1;

				slotCountsByLine.set(seed.rawLineId, slotOrder);

				return [
					slotKey,
					{
						slotId: `slot_${index + 1}`,
						slotOrder,
						lineId: line?.lineId ?? null,
						lineOrder: line?.lineOrder ?? null
					}
				];
			})
	);
	const canonicalVariantMap = new Map(
		[...variantSeeds.entries()]
			.sort((left, right) => {
				const leftSlot = canonicalSlotMap.get(left[1].rawSlotKey);
				const rightSlot = canonicalSlotMap.get(right[1].rawSlotKey);

				return (
					(leftSlot?.lineOrder ?? Number.MAX_SAFE_INTEGER) -
						(rightSlot?.lineOrder ?? Number.MAX_SAFE_INTEGER) ||
					(leftSlot?.slotOrder ?? Number.MAX_SAFE_INTEGER) -
						(rightSlot?.slotOrder ?? Number.MAX_SAFE_INTEGER) ||
					Number(right[1].status === "selected") - Number(left[1].status === "selected") ||
					left[1].firstIndex - right[1].firstIndex
				);
			})
			.map(([variantKey], index) => [variantKey, `variant_${index + 1}`])
	);
	const canonicalLockMap = new Map(
		[...lockSeeds.entries()]
			.sort((left, right) => {
				const leftVariant = canonicalVariantMap.get(left[1].rawVariantKey) ?? "";
				const rightVariant = canonicalVariantMap.get(right[1].rawVariantKey) ?? "";

				return leftVariant.localeCompare(rightVariant) || left[1].firstIndex - right[1].firstIndex;
			})
			.map(([lockKey], index) => [lockKey, `lock_${index + 1}`])
	);

	return normalized.map((label) => {
		const line = label.lineId ? canonicalLineMap.get(label.lineId) : null;
		const rawSlotKey = label.lineId && label.slotId ? `${label.lineId}::${label.slotId}` : null;
		const slot = rawSlotKey ? canonicalSlotMap.get(rawSlotKey) : null;
		const rawVariantKey = rawSlotKey && label.variantId ? `${rawSlotKey}::${label.variantId}` : null;
		const rawLockKey = rawVariantKey && label.lockId ? `${rawVariantKey}::${label.lockId}` : null;

		return {
			index: label.index,
			lineId: line?.lineId ?? null,
			lineOrder: line?.lineOrder ?? null,
			slotId: slot?.slotId ?? null,
			slotOrder: slot?.slotOrder ?? null,
			variantId: rawVariantKey ? canonicalVariantMap.get(rawVariantKey) ?? null : null,
			lockId: rawLockKey ? canonicalLockMap.get(rawLockKey) ?? null : null,
			status: label.status
		} satisfies WordSemanticLabel;
	});
}

const VALID_STATUSES = new Set(["selected", "alternate", "filler", "discarded"]);

function parseLabelsFromJson(raw: string, wordCount: number): WordSemanticLabel[] | null {
	// Strip markdown fences if present
	let cleaned = raw.trim();
	if (cleaned.startsWith("```")) {
		cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return null;
	}

	// Accept { labels: [...] } or bare [...]
	let labelArray: unknown[];
	if (Array.isArray(parsed)) {
		labelArray = parsed;
	} else if (parsed && typeof parsed === "object" && "labels" in parsed && Array.isArray((parsed as { labels: unknown }).labels)) {
		labelArray = (parsed as { labels: unknown[] }).labels;
	} else {
		return null;
	}

	return labelArray.map((item) => {
		const obj = item as Record<string, unknown>;
		const status = typeof obj.status === "string" && VALID_STATUSES.has(obj.status)
			? (obj.status as WordStatus)
			: "discarded";

		return {
			index: typeof obj.index === "number" ? obj.index : 0,
			lineId: typeof obj.lineId === "string" ? obj.lineId : null,
			lineOrder: typeof obj.lineOrder === "number" ? obj.lineOrder : null,
			slotId: typeof obj.slotId === "string" ? obj.slotId : null,
			slotOrder: typeof obj.slotOrder === "number" ? obj.slotOrder : null,
			variantId: typeof obj.variantId === "string" ? obj.variantId : null,
			lockId: typeof obj.lockId === "string" ? obj.lockId : null,
			status
		} satisfies WordSemanticLabel;
	});
}

export const POST: RequestHandler = async ({ request }) => {
	const { words } = await request.json();

	if (!Array.isArray(words) || words.length === 0) {
		return json({ error: "No words provided" }, { status: 400 });
	}

	const timestampedTranscript = words
		.map(
			(w: { text: string; start: number; end: number; confidence: number }, index: number) =>
				`${index}: [${w.start}-${w.end}] "${w.text}"`
		)
		.join("\n");
	const plainTranscript = words.map((word: { text: string }) => word.text).join(" ");

	const prompt = promptTemplate
		.replace("{{plainTranscript}}", plainTranscript)
		.replace("{{timestampedTranscript}}", timestampedTranscript)
		.replace(/\{\{wordCount\}\}/g, String(words.length))
		.replace("{{lastIndex}}", String(words.length - 1));

	const result = await generateText({
		model: openrouter("openai/gpt-5.4"),
		messages: [
			{
				role: "user",
				content: prompt
			}
		]
	});

	const rawText = result.text;
	const llmOutput = { raw: rawText };

	const rawLabels = parseLabelsFromJson(rawText, words.length);

	if (!rawLabels) {
		return json({ error: "LLM did not return valid JSON labels", llmOutput }, { status: 502 });
	}

	const coverageError = validateLabelCoverage(rawLabels, words.length);

	if (coverageError) {
		return json({ error: coverageError, llmOutput }, { status: 502 });
	}

	const labels = canonicalizeLabels(rawLabels);
	const validationError = validateSemanticIds(labels);

	if (validationError) {
		return json({ error: validationError, llmOutput }, { status: 502 });
	}

	const response: AnalyzeTranscriptResponse = {
		labels,
		llmOutput
	};

	return json(response);
};
