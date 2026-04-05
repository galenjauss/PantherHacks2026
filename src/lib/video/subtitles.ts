import type { AutocutAnalysisSegment, AutocutTranscriptWord } from "$lib/types/autocut";

export type VideoSubtitleVerticalAlign = "top" | "middle" | "bottom";

export interface VideoSubtitlePosition {
	verticalAlign: VideoSubtitleVerticalAlign;
	marginYPct: number;
}

export interface VideoSubtitleStyle {
	enabled: boolean;
	position: VideoSubtitlePosition;
	fontFamily: string;
	fontSizePctOfHeight: number;
	bold: boolean;
	lineHeight: number;
	maxWidthPct: number;
	textColor: string;
	activeWordColor: string;
	bgColor: string;
	bgOpacity: number;
	outlineColor: string;
	outlineThickness: number;
	maxWordsPerCue: number;
	maxGapMs: number;
	maxDurationMs: number;
	maxCharsPerLine: number;
}

export interface VideoSubtitleCueWord {
	text: string;
	start: number;
	end: number;
	lineBreakBefore: boolean;
	leadingSpace: boolean;
}

export interface VideoSubtitleCue {
	start: number;
	end: number;
	text: string;
	words: VideoSubtitleCueWord[];
}

export interface VideoSubtitlePayload {
	cues: VideoSubtitleCue[];
	style: VideoSubtitleStyle;
}

export interface VideoSubtitleLayoutContext {
	width: number;
	height: number;
}

export interface VideoSubtitleRenderMetrics {
	fontSizePx: number;
	marginXpx: number;
	marginYpx: number;
	maxCharsPerLine: number;
}

interface TimedSubtitleWord {
	text: string;
	start: number;
	end: number;
}

interface CueLayoutWord {
	lineBreakBefore: boolean;
	leadingSpace: boolean;
}

interface CueLayout {
	text: string;
	words: CueLayoutWord[];
}

const PLAYBACK_WORD_MIN_DURATION_MS = 40;
const MIN_DYNAMIC_CHARS_PER_LINE = 12;
const CHAR_WIDTH_FACTOR = 0.62;

export const VIDEO_SUBTITLE_BASE_TEXT_COLOR_HEX = "#FFFFFF";
export const VIDEO_SUBTITLE_ACTIVE_WORD_COLOR_HEX = "#D8FF4D";
export const VIDEO_SUBTITLE_OUTLINE_COLOR_HEX = "#121212";
export const VIDEO_SUBTITLE_BG_COLOR_HEX = "#000000";
export const VIDEO_SUBTITLE_DEFAULT_FONT_FAMILY = "Montserrat";
export const DEFAULT_VIDEO_SUBTITLE_LAYOUT_CONTEXT: VideoSubtitleLayoutContext = {
	width: 1920,
	height: 1080
};

export const DEFAULT_VIDEO_SUBTITLE_STYLE: VideoSubtitleStyle = {
	enabled: true,
	position: {
		verticalAlign: "bottom",
		marginYPct: 8
	},
	fontFamily: VIDEO_SUBTITLE_DEFAULT_FONT_FAMILY,
	fontSizePctOfHeight: 4.4,
	bold: true,
	lineHeight: 1.08,
	maxWidthPct: 78,
	textColor: VIDEO_SUBTITLE_BASE_TEXT_COLOR_HEX,
	activeWordColor: VIDEO_SUBTITLE_ACTIVE_WORD_COLOR_HEX,
	bgColor: VIDEO_SUBTITLE_BG_COLOR_HEX,
	bgOpacity: 0.62,
	outlineColor: VIDEO_SUBTITLE_OUTLINE_COLOR_HEX,
	outlineThickness: 0,
	maxWordsPerCue: 8,
	maxGapMs: 420,
	maxDurationMs: 2_600,
	maxCharsPerLine: 32
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function normalizeWordText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function normalizeLayoutContext(
	context: VideoSubtitleLayoutContext | undefined
): VideoSubtitleLayoutContext {
	if (!context) return DEFAULT_VIDEO_SUBTITLE_LAYOUT_CONTEXT;

	return {
		width:
			typeof context.width === "number" && Number.isFinite(context.width) && context.width > 0
				? Math.round(context.width)
				: DEFAULT_VIDEO_SUBTITLE_LAYOUT_CONTEXT.width,
		height:
			typeof context.height === "number" && Number.isFinite(context.height) && context.height > 0
				? Math.round(context.height)
				: DEFAULT_VIDEO_SUBTITLE_LAYOUT_CONTEXT.height
	};
}

export function resolveSubtitleRenderMetrics(
	style: VideoSubtitleStyle = DEFAULT_VIDEO_SUBTITLE_STYLE,
	context?: VideoSubtitleLayoutContext
): VideoSubtitleRenderMetrics {
	const normalizedContext = normalizeLayoutContext(context);
	const fontSizePx = clamp(
		Math.round((normalizedContext.height * style.fontSizePctOfHeight) / 100),
		18,
		160
	);
	const maxWidthPx = (normalizedContext.width * style.maxWidthPct) / 100;
	const dynamicCharBudget = clamp(
		Math.round(maxWidthPx / Math.max(fontSizePx * CHAR_WIDTH_FACTOR, 1)),
		MIN_DYNAMIC_CHARS_PER_LINE,
		style.maxCharsPerLine
	);

	return {
		fontSizePx,
		marginXpx: Math.max(Math.round(((100 - style.maxWidthPct) / 200) * normalizedContext.width), 24),
		marginYpx: Math.max(Math.round((style.position.marginYPct / 100) * normalizedContext.height), 24),
		maxCharsPerLine: dynamicCharBudget
	};
}

function tokenNeedsLeadingSpace(text: string, previousText: string | null): boolean {
	if (!previousText) return false;
	if (/^[,.;:!?%)}\]”’]/.test(text)) return false;
	if (/[([{“‘]$/.test(previousText)) return false;
	return true;
}

function renderCueText(words: string[], layoutWords: CueLayoutWord[]): string {
	return words.reduce((result, word, index) => {
		const layoutWord = layoutWords[index];
		const prefix = layoutWord.lineBreakBefore ? "\n" : layoutWord.leadingSpace ? " " : "";
		return `${result}${prefix}${word}`;
	}, "");
}

function buildCueLayout(words: string[], maxCharsPerLine: number): CueLayout {
	if (words.length === 0) {
		return { text: "", words: [] };
	}

	const singleLineLayoutWords = words.map((word, index) => ({
		lineBreakBefore: false,
		leadingSpace: tokenNeedsLeadingSpace(word, index > 0 ? words[index - 1] : null)
	}));
	const singleLineText = renderCueText(words, singleLineLayoutWords);

	if (singleLineText.length <= maxCharsPerLine || words.length <= 1) {
		return { text: singleLineText, words: singleLineLayoutWords };
	}

	let bestSplit = -1;
	let bestScore = Number.POSITIVE_INFINITY;

	for (let splitIndex = 1; splitIndex < words.length; splitIndex += 1) {
		const layoutWords = words.map((word, index) => ({
			lineBreakBefore: index === splitIndex,
			leadingSpace:
				index === splitIndex
					? false
					: tokenNeedsLeadingSpace(word, index > 0 ? words[index - 1] : null)
		}));
		const firstLine = renderCueText(words.slice(0, splitIndex), layoutWords.slice(0, splitIndex));
		const secondLine = renderCueText(words.slice(splitIndex), layoutWords.slice(splitIndex)).replace(
			/^\n/,
			""
		);
		if (!firstLine || !secondLine) continue;

		const longestLine = Math.max(firstLine.length, secondLine.length);
		const score =
			Math.abs(firstLine.length - secondLine.length) +
			Math.max(longestLine - Math.round(maxCharsPerLine * 1.15), 0) * 40;

		if (score < bestScore) {
			bestScore = score;
			bestSplit = splitIndex;
		}
	}

	if (bestSplit === -1) {
		return { text: singleLineText, words: singleLineLayoutWords };
	}

	const layoutWords = words.map((word, index) => ({
		lineBreakBefore: index === bestSplit,
		leadingSpace:
			index === bestSplit
				? false
				: tokenNeedsLeadingSpace(word, index > 0 ? words[index - 1] : null)
	}));

	return {
		text: renderCueText(words, layoutWords),
		words: layoutWords
	};
}

function normalizeTimedWords(words: TimedSubtitleWord[]): TimedSubtitleWord[] {
	return words
		.map((word) => ({
			text: normalizeWordText(word.text),
			start: Math.max(Math.round(word.start), 0),
			end: Math.max(Math.round(word.end), 0)
		}))
		.filter((word) => word.text.length > 0)
		.filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end))
		.filter((word) => word.end - word.start >= PLAYBACK_WORD_MIN_DURATION_MS);
}

function finalizeCue(
	words: TimedSubtitleWord[],
	style: VideoSubtitleStyle,
	context?: VideoSubtitleLayoutContext
): VideoSubtitleCue | null {
	if (words.length === 0) return null;

	const metrics = resolveSubtitleRenderMetrics(style, context);
	const layout = buildCueLayout(
		words.map((word) => word.text),
		metrics.maxCharsPerLine
	);
	if (!layout.text) return null;

	const start = words[0].start;
	const end = Math.max(words[words.length - 1].end, start + PLAYBACK_WORD_MIN_DURATION_MS);

	return {
		start,
		end,
		text: layout.text,
		words: words.map((word, index) => ({
			text: word.text,
			start: word.start,
			end: word.end,
			lineBreakBefore: layout.words[index]?.lineBreakBefore ?? false,
			leadingSpace: layout.words[index]?.leadingSpace ?? false
		}))
	};
}

function shouldBreakCue(
	currentCueWords: TimedSubtitleWord[],
	nextWord: TimedSubtitleWord,
	style: VideoSubtitleStyle
): boolean {
	if (currentCueWords.length === 0) return false;

	const previousWord = currentCueWords[currentCueWords.length - 1];
	const gapMs = Math.max(nextWord.start - previousWord.end, 0);
	const cueDurationMs = Math.max(nextWord.end - currentCueWords[0].start, 0);
	const sentenceEnded = /[.!?]["')\]”’]*$/.test(previousWord.text);

	return (
		gapMs > style.maxGapMs ||
		currentCueWords.length >= style.maxWordsPerCue ||
		cueDurationMs > style.maxDurationMs ||
		(sentenceEnded && currentCueWords.length >= 3)
	);
}

function buildSubtitleWordsFromTranscriptWords(words: AutocutTranscriptWord[]): TimedSubtitleWord[] {
	return normalizeTimedWords(
		words.map((word) => ({
			text: word.text,
			start: word.start,
			end: word.end
		}))
	);
}

function buildSubtitleWordsForPlayback(
	playbackSegments: AutocutAnalysisSegment[],
	transcriptWords: AutocutTranscriptWord[],
	timingMode: "source" | "output"
): TimedSubtitleWord[] {
	if (playbackSegments.length === 0 || transcriptWords.length === 0) {
		return [];
	}

	const words: TimedSubtitleWord[] = [];
	let outputCursorMs = 0;

	for (const segment of playbackSegments) {
		const segmentStart = Math.max(segment.start, 0);
		const segmentEnd = Math.max(segment.end, segmentStart);
		const segmentDurationMs = segmentEnd - segmentStart;

		if (segmentDurationMs < PLAYBACK_WORD_MIN_DURATION_MS) {
			outputCursorMs += segmentDurationMs;
			continue;
		}

		for (const word of transcriptWords) {
			if (word.end <= segmentStart) continue;
			if (word.start >= segmentEnd) break;

			const clippedStart = Math.max(word.start, segmentStart);
			const clippedEnd = Math.min(word.end, segmentEnd);
			if (clippedEnd - clippedStart < PLAYBACK_WORD_MIN_DURATION_MS) continue;

			words.push({
				text: word.text,
				start:
					timingMode === "output"
						? outputCursorMs + (clippedStart - segmentStart)
						: clippedStart,
				end:
					timingMode === "output"
						? outputCursorMs + (clippedEnd - segmentStart)
						: clippedEnd
			});
		}

		outputCursorMs += segmentDurationMs;
	}

	return normalizeTimedWords(words);
}

export function buildSubtitleCuesFromTimedWords(
	words: TimedSubtitleWord[],
	style: VideoSubtitleStyle = DEFAULT_VIDEO_SUBTITLE_STYLE,
	context?: VideoSubtitleLayoutContext
): VideoSubtitleCue[] {
	if (!style.enabled) return [];

	const normalizedWords = normalizeTimedWords(words);
	if (normalizedWords.length === 0) return [];

	const cues: VideoSubtitleCue[] = [];
	let currentCueWords: TimedSubtitleWord[] = [];

	for (const word of normalizedWords) {
		if (shouldBreakCue(currentCueWords, word, style)) {
			const cue = finalizeCue(currentCueWords, style, context);
			if (cue) cues.push(cue);
			currentCueWords = [];
		}

		currentCueWords.push(word);
	}

	const trailingCue = finalizeCue(currentCueWords, style, context);
	if (trailingCue) cues.push(trailingCue);

	return cues;
}

export function buildSourceSubtitleCues(
	transcriptWords: AutocutTranscriptWord[],
	style: VideoSubtitleStyle = DEFAULT_VIDEO_SUBTITLE_STYLE,
	context?: VideoSubtitleLayoutContext
): VideoSubtitleCue[] {
	return buildSubtitleCuesFromTimedWords(
		buildSubtitleWordsFromTranscriptWords(transcriptWords),
		style,
		context
	);
}

export function buildSelectedSourceSubtitleCues(
	playbackSegments: AutocutAnalysisSegment[],
	transcriptWords: AutocutTranscriptWord[],
	style: VideoSubtitleStyle = DEFAULT_VIDEO_SUBTITLE_STYLE,
	context?: VideoSubtitleLayoutContext
): VideoSubtitleCue[] {
	const words = buildSubtitleWordsForPlayback(playbackSegments, transcriptWords, "source").sort(
		(a, b) => a.start - b.start || a.end - b.end
	);

	return buildSubtitleCuesFromTimedWords(words, style, context);
}

export function buildExportSubtitleCues(
	playbackSegments: AutocutAnalysisSegment[],
	transcriptWords: AutocutTranscriptWord[],
	style: VideoSubtitleStyle = DEFAULT_VIDEO_SUBTITLE_STYLE,
	context?: VideoSubtitleLayoutContext
): VideoSubtitleCue[] {
	return buildSubtitleCuesFromTimedWords(
		buildSubtitleWordsForPlayback(playbackSegments, transcriptWords, "output"),
		style,
		context
	);
}

export function findActiveSubtitleWordIndex(cue: VideoSubtitleCue | null, timeMs: number): number | null {
	if (!cue) return null;

	for (const [index, word] of cue.words.entries()) {
		if (timeMs >= word.start && timeMs < word.end) {
			return index;
		}
	}

	return null;
}

function isCueWord(value: unknown): value is VideoSubtitleCueWord {
	if (!value || typeof value !== "object") return false;

	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.text === "string" &&
		typeof candidate.start === "number" &&
		typeof candidate.end === "number"
	);
}

function isCue(value: unknown): value is VideoSubtitleCue {
	if (!value || typeof value !== "object") return false;

	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.start === "number" &&
		typeof candidate.end === "number" &&
		typeof candidate.text === "string"
	);
}

function normalizeSubtitleStyle(value: unknown): VideoSubtitleStyle {
	const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	const rawPosition =
		candidate.position && typeof candidate.position === "object"
			? (candidate.position as Record<string, unknown>)
			: {};
	const rawVerticalAlign = rawPosition.verticalAlign;
	const verticalAlign: VideoSubtitleVerticalAlign =
		rawVerticalAlign === "top" || rawVerticalAlign === "middle" || rawVerticalAlign === "bottom"
			? rawVerticalAlign
			: DEFAULT_VIDEO_SUBTITLE_STYLE.position.verticalAlign;
	const rawFontSizePct =
		typeof candidate.fontSizePctOfHeight === "number" && Number.isFinite(candidate.fontSizePctOfHeight)
			? candidate.fontSizePctOfHeight
			: typeof candidate.fontSizePx === "number" && Number.isFinite(candidate.fontSizePx)
				? (candidate.fontSizePx / DEFAULT_VIDEO_SUBTITLE_LAYOUT_CONTEXT.height) * 100
				: DEFAULT_VIDEO_SUBTITLE_STYLE.fontSizePctOfHeight;

	return {
		enabled:
			typeof candidate.enabled === "boolean"
				? candidate.enabled
				: DEFAULT_VIDEO_SUBTITLE_STYLE.enabled,
		position: {
			verticalAlign,
			marginYPct:
				typeof rawPosition.marginYPct === "number" && Number.isFinite(rawPosition.marginYPct)
					? clamp(rawPosition.marginYPct, 0, 30)
					: DEFAULT_VIDEO_SUBTITLE_STYLE.position.marginYPct
		},
		fontFamily:
			typeof candidate.fontFamily === "string" && candidate.fontFamily.trim()
				? candidate.fontFamily.trim()
				: DEFAULT_VIDEO_SUBTITLE_STYLE.fontFamily,
		fontSizePctOfHeight: clamp(rawFontSizePct, 2.2, 8.5),
		bold:
			typeof candidate.bold === "boolean"
				? candidate.bold
				: DEFAULT_VIDEO_SUBTITLE_STYLE.bold,
		lineHeight:
			typeof candidate.lineHeight === "number" && Number.isFinite(candidate.lineHeight)
				? clamp(candidate.lineHeight, 0.8, 2.0)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.lineHeight,
		maxWidthPct:
			typeof candidate.maxWidthPct === "number" && Number.isFinite(candidate.maxWidthPct)
				? clamp(candidate.maxWidthPct, 42, 92)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.maxWidthPct,
		textColor:
			typeof candidate.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(candidate.textColor)
				? candidate.textColor
				: DEFAULT_VIDEO_SUBTITLE_STYLE.textColor,
		activeWordColor:
			typeof candidate.activeWordColor === "string" && /^#[0-9a-fA-F]{6}$/.test(candidate.activeWordColor)
				? candidate.activeWordColor
				: DEFAULT_VIDEO_SUBTITLE_STYLE.activeWordColor,
		bgColor:
			typeof candidate.bgColor === "string" && /^#[0-9a-fA-F]{6}$/.test(candidate.bgColor)
				? candidate.bgColor
				: DEFAULT_VIDEO_SUBTITLE_STYLE.bgColor,
		bgOpacity:
			typeof candidate.bgOpacity === "number" && Number.isFinite(candidate.bgOpacity)
				? clamp(candidate.bgOpacity, 0, 1)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.bgOpacity,
		outlineColor:
			typeof candidate.outlineColor === "string" && /^#[0-9a-fA-F]{6}$/.test(candidate.outlineColor)
				? candidate.outlineColor
				: DEFAULT_VIDEO_SUBTITLE_STYLE.outlineColor,
		outlineThickness:
			typeof candidate.outlineThickness === "number" && Number.isFinite(candidate.outlineThickness)
				? clamp(candidate.outlineThickness, 0, 8)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.outlineThickness,
		maxWordsPerCue:
			typeof candidate.maxWordsPerCue === "number" && Number.isFinite(candidate.maxWordsPerCue)
				? clamp(Math.round(candidate.maxWordsPerCue), 1, 16)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.maxWordsPerCue,
		maxGapMs:
			typeof candidate.maxGapMs === "number" && Number.isFinite(candidate.maxGapMs)
				? clamp(Math.round(candidate.maxGapMs), 40, 2_000)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.maxGapMs,
		maxDurationMs:
			typeof candidate.maxDurationMs === "number" && Number.isFinite(candidate.maxDurationMs)
				? clamp(Math.round(candidate.maxDurationMs), 250, 10_000)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.maxDurationMs,
		maxCharsPerLine:
			typeof candidate.maxCharsPerLine === "number" && Number.isFinite(candidate.maxCharsPerLine)
				? clamp(Math.round(candidate.maxCharsPerLine), MIN_DYNAMIC_CHARS_PER_LINE, 56)
				: DEFAULT_VIDEO_SUBTITLE_STYLE.maxCharsPerLine
	};
}

export function normalizeSubtitlePayload(value: unknown): VideoSubtitlePayload | null {
	if (!value || typeof value !== "object") return null;

	const candidate = value as Record<string, unknown>;
	if (!Array.isArray(candidate.cues)) return null;

	const style = normalizeSubtitleStyle(candidate.style);
	const cues = candidate.cues
		.filter(isCue)
		.map((cue) => {
			const cueCandidate = cue as unknown as Record<string, unknown>;
			const words = Array.isArray(cueCandidate.words)
				? cueCandidate.words
					.filter(isCueWord)
					.map((word, index, allWords) => ({
						text: word.text.replace(/\r/g, "").trim(),
						start: Math.max(Math.round(word.start), 0),
						end: Math.max(Math.round(word.end), 0),
						lineBreakBefore: Boolean((word as unknown as Record<string, unknown>).lineBreakBefore),
						leadingSpace:
							typeof (word as unknown as Record<string, unknown>).leadingSpace === "boolean"
								? Boolean((word as unknown as Record<string, unknown>).leadingSpace)
								: tokenNeedsLeadingSpace(
									word.text,
									index > 0 ? allWords[index - 1]?.text ?? null : null
								)
					}))
					.filter((word) => word.text.length > 0)
					.filter((word) => word.end - word.start >= PLAYBACK_WORD_MIN_DURATION_MS)
				: [];

			return {
				start: Math.max(Math.round(cue.start), 0),
				end: Math.max(Math.round(cue.end), 0),
				text: cue.text.replace(/\r/g, "").trim(),
				words
			};
		})
		.filter((cue) => cue.text.length > 0 && cue.end - cue.start >= PLAYBACK_WORD_MIN_DURATION_MS)
		.map((cue) => ({
			...cue,
			words: cue.words.length > 0
				? cue.words
				: buildSubtitleCuesFromTimedWords(
					[
						{
							text: cue.text.replace(/\n/g, " "),
							start: cue.start,
							end: cue.end
						}
					],
					style
				)[0]?.words ?? []
		}));

	if (cues.length === 0) {
		return style.enabled ? null : { cues: [], style };
	}

	return { cues, style };
}
