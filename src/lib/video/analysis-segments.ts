import type {
	AutocutAnalysisSegment,
	AutocutTranscriptWord,
	WordSemanticLabel,
	WordStatus
} from "$lib/types/autocut";

export type AnalysisWordLabel = WordSemanticLabel;

export interface AnalysisSegmentOptions {
	deadSpaceThresholdMs: number;
	clipEndTrimMs: number;
}

export const DEFAULT_ANALYSIS_SEGMENT_OPTIONS: AnalysisSegmentOptions = {
	deadSpaceThresholdMs: 700,
	clipEndTrimMs: 225
};

export function normalizeMs(
	value: unknown,
	fallback: number,
	{ min = 0, max = 5000 }: { min?: number; max?: number } = {}
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

	return Math.min(max, Math.max(min, Math.round(value)));
}

export function trimSegmentEnd(start: number, end: number, clipEndTrimMs: number): number {
	if (clipEndTrimMs <= 0) return end;

	const duration = end - start;
	if (duration <= 1) return end;

	return end - Math.min(clipEndTrimMs, duration - 1);
}

function categoryForStatus(
	status: WordStatus
): Exclude<AutocutAnalysisSegment["category"], "dead_space"> {
	if (status === "selected") return "good";
	if (status === "filler") return "filler_words";

	return "retake";
}

function sameSemanticSegment(
	left: AutocutAnalysisSegment,
	right: Omit<AutocutAnalysisSegment, "start" | "end" | "text" | "wordStartIndex" | "wordEndIndex">
): boolean {
	return (
		left.category === right.category &&
		(left.lineId ?? null) === (right.lineId ?? null) &&
		(left.lineOrder ?? null) === (right.lineOrder ?? null) &&
		(left.slotId ?? null) === (right.slotId ?? null) &&
		(left.slotOrder ?? null) === (right.slotOrder ?? null) &&
		(left.variantId ?? null) === (right.variantId ?? null) &&
		(left.lockId ?? null) === (right.lockId ?? null) &&
		(left.status ?? null) === (right.status ?? null)
	);
}

export function buildAnalysisSegments(
	words: AutocutTranscriptWord[],
	labels: AnalysisWordLabel[],
	options: AnalysisSegmentOptions
): AutocutAnalysisSegment[] {
	const labelMap = new Map<number, AnalysisWordLabel>();
	for (const label of labels) {
		labelMap.set(label.index, label);
	}

	const speechSegments: AutocutAnalysisSegment[] = [];

	for (let index = 0; index < words.length; index += 1) {
		const word = words[index];
		const label = labelMap.get(index);
		if (!label) continue;

		const category = categoryForStatus(label.status);
		const segmentMeta = {
			category,
			lineId: label.lineId ?? null,
			lineOrder: label.lineOrder ?? null,
			slotId: label.slotId ?? null,
			slotOrder: label.slotOrder ?? null,
			variantId: label.variantId ?? null,
			lockId: label.lockId ?? null,
			status: label.status,
			// Legacy aliases kept for downstream compatibility while the rest of the app migrates.
			takeId: label.variantId ?? null,
			unitId: label.slotId ?? null,
			unitOrder: label.slotOrder ?? null,
			beatId: label.slotId ?? null
		} satisfies Omit<
			AutocutAnalysisSegment,
			"start" | "end" | "text" | "wordStartIndex" | "wordEndIndex"
		>;
		const previousWord = index > 0 ? words[index - 1] : null;
		const gapMs = previousWord ? Math.max(0, word.start - previousWord.end) : 0;
		const shouldSplitForPause = gapMs > options.deadSpaceThresholdMs;
		const last = speechSegments[speechSegments.length - 1];

		if (last && !shouldSplitForPause && sameSemanticSegment(last, segmentMeta)) {
			last.end = word.end;
			last.text += ` ${word.text}`;
			last.wordEndIndex = index;
			continue;
		}

		speechSegments.push({
			start: word.start,
			end: word.end,
			text: word.text,
			wordStartIndex: index,
			wordEndIndex: index,
			...segmentMeta
		});
	}

	const trimmedSpeechSegments = speechSegments.map((segment) => {
		if (segment.category === "dead_space" || segment.category === "filler_words") {
			return segment;
		}

		return {
			...segment,
			end: trimSegmentEnd(segment.start, segment.end, options.clipEndTrimMs)
		};
	});

	const segments: AutocutAnalysisSegment[] = [];

	for (const [index, segment] of trimmedSpeechSegments.entries()) {
		if (index > 0) {
			const rawPrevious = speechSegments[index - 1];
			const rawCurrent = speechSegments[index];
			const gap = rawCurrent.start - rawPrevious.end;

			if (gap > options.deadSpaceThresholdMs) {
				segments.push({
					start: rawPrevious.end,
					end: rawCurrent.start,
					category: "dead_space",
					text: "",
					wordStartIndex: null,
					wordEndIndex: null,
					lineId: null,
					lineOrder: null,
					slotId: null,
					slotOrder: null,
					variantId: null,
					lockId: null,
					status: null,
					takeId: null,
					unitId: null,
					unitOrder: null,
					beatId: null
				});
			}
		}

		segments.push(segment);
	}

	return segments;
}
