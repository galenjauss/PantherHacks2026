import type {
	AutocutAnalysisSegment,
	AutocutTranscriptWord
} from "$lib/types/autocut";

export interface AnalysisWordLabel {
	index: number;
	category: "good" | "filler_words" | "retake";
	takeId?: string | null;
	beatId?: string | null;
}

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

export function buildAnalysisSegments(
	words: AutocutTranscriptWord[],
	labels: AnalysisWordLabel[],
	options: AnalysisSegmentOptions
): AutocutAnalysisSegment[] {
	const labelMap = new Map<number, AnalysisWordLabel>();
	for (const label of labels) {
		labelMap.set(label.index, label);
	}

	const segments: AutocutAnalysisSegment[] = [];

	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		const label = labelMap.get(i);
		const category = label?.category ?? "good";
		const takeId = label?.takeId ?? null;
		const beatId = label?.beatId ?? null;

		if (i > 0) {
			const prevEnd = words[i - 1].end;
			const gap = word.start - prevEnd;

			if (gap > options.deadSpaceThresholdMs) {
				const last = segments[segments.length - 1];
				if (last && last.category === "dead_space") {
					last.end = word.start;
				} else {
					segments.push({
						start: prevEnd,
						end: word.start,
						category: "dead_space",
						text: ""
					});
				}
			}
		}

		const last = segments[segments.length - 1];
		if (
			last &&
			last.category === category &&
			(last.takeId ?? null) === takeId &&
			(last.beatId ?? null) === beatId
		) {
			last.end = word.end;
			last.text += " " + word.text;
		} else {
			segments.push({
				start: word.start,
				end: word.end,
				category,
				text: word.text,
				takeId,
				beatId
			});
		}
	}

	return segments.map((segment) => {
		if (segment.category !== "good") return segment;

		return {
			...segment,
			end: trimSegmentEnd(segment.start, segment.end, options.clipEndTrimMs)
		};
	});
}
