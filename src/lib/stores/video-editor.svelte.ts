import { browser } from "$app/environment";

import type {
	AutocutAnalysisSegment,
	AutocutJob,
	AutocutJobResponse,
	AnalyzeTranscriptResponse,
	DebugProblem,
	AutocutTranscriptWord,
	CreateAutocutJobRequest,
	SpeechChunk,
	WordSemanticLabel
} from "$lib/types/autocut";
import {
	buildAnalysisSegments,
	DEFAULT_ANALYSIS_SEGMENT_OPTIONS
} from "$lib/video/analysis-segments";
import {
	buildAnalysisSegmentRefs,
	type AnalysisSegmentRef,
	type EditorBeatGroup,
	type EditorBeatVariant,
	type SemanticModel,
	buildSemanticModel
} from "$lib/video/derived-beats";
import {
	DEFAULT_VIDEO_SUBTITLE_STYLE,
	buildExportSubtitleCues,
	buildSelectedSourceSubtitleCues,
	buildSourceSubtitleCues,
	findActiveSubtitleWordIndex,
	type VideoSubtitleCue,
	type VideoSubtitleLayoutContext,
	type VideoSubtitlePayload,
	type VideoSubtitleStyle
} from "$lib/video/subtitles";
import { buildSpeechChunks } from "$lib/video/word-chunks";

export type EditorCutCategory = "filler_words" | "dead_space" | "retake";
export type EditorFilter = "all" | EditorCutCategory;

interface SegmentMeta {
	label: string;
	shortLabel: string;
	color: string;
}

interface DebugLabelRow {
	index: number;
	word: string;
	start: number | null;
	end: number | null;
	status: WordSemanticLabel["status"];
	lineId: string | null;
	lineOrder: number | null;
	slotId: string | null;
	slotOrder: number | null;
	variantId: string | null;
	lockId: string | null;
}

type WorkflowStepState = "done" | "active" | "pending";

export interface EditorCutSegment extends Omit<AutocutAnalysisSegment, "category"> {
	id: string;
	category: EditorCutCategory;
	durationMs: number;
	label: string;
	shortLabel: string;
	color: string;
	locked: boolean;
}

export interface EditorClipStripBeatBlock {
	id: string;
	beatId: string;
	widthPct: number;
	activeLabel: string;
	color: string;
	humanLabel: string;
	startMs: number;
	endMs: number;
	variants: Array<
		Pick<EditorBeatVariant, "id" | "variantId" | "label" | "durationMs" | "start" | "previewText"> & {
			kind: EditorBeatVariant["status"];
			isSelected: boolean;
			fillPct: number;
		}
	>;
}

export interface EditedTimelineBlock {
	id: string;
	kind: "beat" | "gap" | "cut";
	beatId: string | null;
	label: string;
	humanLabel: string;
	durationMs: number;
	widthPct: number;
	color: string;
	startMs: number;
}

export interface EditorTranscriptWord {
	id: number;
	text: string;
	start: number;
	end: number;
	cut: "filler" | "pause" | "restart" | null;
	keep: boolean;
	segmentId: string | null;
	lineLabel: string | null;
	slotLabel: string | null;
	playOrder: number | null;
	showPlayMarker: boolean;
}

const BEAT_COLORS = [
	"#7c3aed", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
	"#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"
];

const SEGMENT_META: Record<EditorCutCategory, SegmentMeta> = {
	filler_words: {
		label: "Filler words",
		shortLabel: "Filler",
		color: "#ef4444"
	},
	dead_space: {
		label: "Dead pauses",
		shortLabel: "Pause",
		color: "#6b7280"
	},
	retake: {
		label: "Retakes",
		shortLabel: "Retake",
		color: "#3b82f6"
	}
};

const CLIP_STRIP_LABEL_LIMIT = 12;
const TIMELINE_BAR_COUNT = 96;
const TIMELINE_LABEL_COUNT = 8;
const PREVIEW_EPSILON_MS = 4;
const PREVIEW_SEEK_SETTLE_MS = 120;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function segmentId(index: number): string {
	return `segment:${index}`;
}

function humanizeSegmentText(segment: AutocutAnalysisSegment): string {
	if (segment.category === "dead_space") {
		return "Silence";
	}

	const text = segment.text.trim();
	if (!text) return "Marked segment";

	return text;
}

function clipStripLabel(segment: AutocutAnalysisSegment): string {
	if (segment.category === "dead_space") return "pause";

	const text = segment.text.trim().replace(/\s+/g, " ");

	if (!text) return "cut";
	if (text.length <= CLIP_STRIP_LABEL_LIMIT) return text;

	return `${text.slice(0, CLIP_STRIP_LABEL_LIMIT - 1)}…`;
}

function gapContainsCutContent(
	gapStart: number,
	gapEnd: number,
	allSegments: AutocutAnalysisSegment[]
): boolean {
	for (const seg of allSegments) {
		if (seg.start >= gapEnd) break;
		if (seg.end <= gapStart) continue;

		if (seg.category === "filler_words" || seg.category === "retake") {
			return true;
		}
	}

	return false;
}

function buildPlaybackSegments(
	segments: AutocutAnalysisSegment[],
	deadSpaceThresholdMs: number,
	allSegments: AutocutAnalysisSegment[]
): AutocutAnalysisSegment[] {
	const merged: AutocutAnalysisSegment[] = [];

	for (const segment of segments) {
		if (segment.category !== "good") continue;

		const last = merged[merged.length - 1];
		if (last) {
			const gapMs = segment.start - last.end;

			// Only merge segments that move forward in video time (gap >= 0).
			// A negative gap means we're jumping backward to a different take/
			// variant — those must stay as separate playback segments so the
			// player seeks to the correct position.
			if (gapMs >= 0 && gapMs <= deadSpaceThresholdMs && !gapContainsCutContent(last.end, segment.start, allSegments)) {
				last.end = Math.max(last.end, segment.end);
				last.text = [last.text, segment.text].filter(Boolean).join(" ").trim();
				last.takeId = last.takeId === segment.takeId ? last.takeId : null;
				continue;
			}
		}

		merged.push({ ...segment });
	}

	return merged;
}

function humanizeId(id: string, prefix: string): string {
	const num = id.replace(new RegExp(`^${prefix}_`), "");
	return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${num}`;
}

function humanizeSlotId(slotId: string): string {
	return humanizeId(slotId, "slot");
}

function safeParseJson(value: string): unknown {
	if (!value.trim()) return null;

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function joinTexts(values: string[]): string {
	return values
		.map((value) => value.trim())
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function buildExportFileName(fileName: string | undefined): string {
	const baseName = fileName?.replace(/\.[^.]+$/, "") || "snip-export";

	return `${baseName}-snip.mp4`;
}

function parseContentDispositionFileName(header: string | null): string | null {
	if (!header) return null;

	const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1]);
		} catch {
			return utf8Match[1];
		}
	}

	const basicMatch = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;]+)/i);
	return basicMatch?.[1]?.trim() ?? null;
}

class VideoEditorState {
	selectedFile = $state<File | null>(null);
	videoUrl = $state<string | null>(null);
	videoDurationMs = $state<number | null>(null);
	videoWidthPx = $state<number | null>(null);
	videoHeightPx = $state<number | null>(null);
	currentTimeMs = $state(0);
	previewMode = $state<"before" | "after">("after");
	isPreviewPlaying = $state(false);
	currentPreviewSegmentIndex = $state(0);
	activeFilter = $state<EditorFilter>("all");
	selectedCutIds = $state<string[]>([]);
	selectedSlotVariantIds = $state<Record<string, string>>({});
	deadSpaceThreshold = $state(DEFAULT_ANALYSIS_SEGMENT_OPTIONS.deadSpaceThresholdMs);
	clipEndTrim = $state(DEFAULT_ANALYSIS_SEGMENT_OPTIONS.clipEndTrimMs);
	cutToggles = $state<Record<EditorCutCategory, boolean>>({
		filler_words: true,
		dead_space: true,
		retake: true
	});
	transcribing = $state(false);
	pollingTranscript = $state(false);
	analyzing = $state(false);
	creatingAutocutJob = $state(false);
	transcriptId = $state("");
	transcriptStatus = $state("");
	transcriptText = $state("");
	transcriptWords = $state<AutocutTranscriptWord[]>([]);
	wordLabels = $state<WordSemanticLabel[]>([]);
	analysisLLMOutputJson = $state("");
	transcriptError = $state("");
	analysisError = $state("");
	jobError = $state("");
	job = $state<AutocutJob | null>(null);
	exporting = $state(false);
	exportError = $state("");
	subtitleStyle = $state<VideoSubtitleStyle>({
		...DEFAULT_VIDEO_SUBTITLE_STYLE,
		position: {
			...DEFAULT_VIDEO_SUBTITLE_STYLE.position
		}
	});

	get selectedBeatVariantIds(): Record<string, string> {
		return this.selectedSlotVariantIds;
	}

	set selectedBeatVariantIds(value: Record<string, string>) {
		this.selectedSlotVariantIds = value;
	}

	private currentRun = 0;
	private transcriptPollDelay: ReturnType<typeof setTimeout> | null = null;
	private activeJobSyncToken = 0;
	private lastSyncSignature = "";
	private lastSelectionSignature = "";
	private lastBeatSelectionSignature = "";

	// Caches for expensive derived data that only depend on transcript/labels/settings
	private _cachedSemanticModelKey = "";
	private _cachedSemanticModel: SemanticModel | null = null;
	private _cachedAnalysisSegmentsKey = "";
	private _cachedAnalysisSegments: AutocutAnalysisSegment[] | null = null;
	private _cachedAnalysisSegmentRefs: AnalysisSegmentRef<AutocutAnalysisSegment>[] | null = null;
	private _cachedSpeechChunksKey = "";
	private _cachedSpeechChunks: SpeechChunk[] | null = null;
	private _cachedSourceSubtitleCuesKey = "";
	private _cachedSourceSubtitleCues: VideoSubtitleCue[] | null = null;
	private _cachedSelectedSourceSubtitleCuesKey = "";
	private _cachedSelectedSourceSubtitleCues: VideoSubtitleCue[] | null = null;
	private _cachedExportSubtitleCuesKey = "";
	private _cachedExportSubtitleCues: VideoSubtitleCue[] | null = null;
	private previewTimeUpdateHandler: (() => void) | null = null;
	private previewEndedHandler: (() => void) | null = null;
	private previewRafId: number | null = null;
	private videoElement: HTMLVideoElement | null = null;

	get totalDurationMs(): number {
		return this.videoDurationMs ?? this.transcriptWords[this.transcriptWords.length - 1]?.end ?? 0;
	}

	get isBusy(): boolean {
		return this.transcribing || this.pollingTranscript || this.analyzing;
	}

	get isSyncing(): boolean {
		return this.creatingAutocutJob;
	}

	get hasErrors(): boolean {
		return Boolean(this.transcriptError || this.analysisError || this.jobError);
	}

	get isReady(): boolean {
		return Boolean(this.selectedFile && this.wordLabels.length > 0 && !this.isBusy && !this.hasErrors);
	}

	get hasAnalysisLLMOutput(): boolean {
		return this.analysisLLMOutputJson.trim().length > 0;
	}

	get hasDebugExport(): boolean {
		return this.transcriptWords.length > 0 || this.wordLabels.length > 0 || this.hasAnalysisLLMOutput;
	}

	get canExport(): boolean {
		return Boolean(this.videoUrl && this.playbackSegments.length > 0 && !this.isBusy && !this.exporting);
	}

	get exportStatusLabel(): string {
		if (this.exportError) return this.exportError;
		return this.exporting ? "Rendering MP4..." : "";
	}

	private get subtitleStyleSignature(): string {
		const style = this.subtitleStyle;

		return [
			Number(style.enabled),
			style.position.verticalAlign,
			style.position.marginYPct,
			style.fontFamily,
			style.fontSizePctOfHeight,
			Number(style.bold),
			style.lineHeight,
			style.maxWidthPct,
			style.textColor,
			style.activeWordColor,
			style.bgColor,
			style.bgOpacity,
			style.outlineColor,
			style.outlineThickness,
			style.maxWordsPerCue,
			style.maxGapMs,
			style.maxDurationMs,
			style.maxCharsPerLine
		].join(":");
	}

	private get subtitleLayoutContext(): VideoSubtitleLayoutContext {
		return {
			width: this.videoWidthPx ?? 1920,
			height: this.videoHeightPx ?? 1080
		};
	}

	private labelDebugRows(): DebugLabelRow[] {
		return this.wordLabels.map((label) => {
			const word = this.transcriptWords[label.index];

			return {
				index: label.index,
				word: word?.text ?? "",
				start: word?.start ?? null,
				end: word?.end ?? null,
				status: label.status,
				lineId: label.lineId ?? null,
				lineOrder: label.lineOrder ?? null,
				slotId: label.slotId ?? null,
				slotOrder: label.slotOrder ?? null,
				variantId: label.variantId ?? null,
				lockId: label.lockId ?? null
			};
		});
	}

	get semanticModel(): SemanticModel {
		if (this.transcriptWords.length === 0 || this.wordLabels.length === 0) {
			return {
				slotGroups: [] as EditorBeatGroup[],
				lineSummaries: [],
				slotSummaries: [],
				variantSummaries: [],
				problems: [] as DebugProblem[]
			};
		}

		const key = `${this.transcriptWords.length}:${this.wordLabels.length}:${this.deadSpaceThreshold}`;
		if (key === this._cachedSemanticModelKey && this._cachedSemanticModel) {
			return this._cachedSemanticModel;
		}

		const result = buildSemanticModel(this.transcriptWords, this.wordLabels, this.speechChunks);
		this._cachedSemanticModelKey = key;
		this._cachedSemanticModel = result;
		return result;
	}

	get debugExportJson(): string {
		const selectedCutIds = new Set(this.selectedCutIds);
		const labelRows = this.labelDebugRows();
		const semanticModel = this.semanticModel;

		return JSON.stringify(
			{
				exportedAt: new Date().toISOString(),
				file: this.selectedFile
					? {
						name: this.selectedFile.name,
						size: this.selectedFile.size,
						type: this.selectedFile.type || null,
						lastModified: this.selectedFile.lastModified
					}
					: null,
				status: {
					label: this.statusLabel,
					description: this.statusDescription,
					transcriptId: this.transcriptId || null,
					transcriptStatus: this.transcriptStatus || null,
					transcriptError: this.transcriptError || null,
					analysisError: this.analysisError || null,
					jobError: this.jobError || null
				},
				settings: {
					deadSpaceThresholdMs: this.deadSpaceThreshold,
					clipEndTrimMs: this.clipEndTrim,
					cutToggles: this.cutToggles,
					previewMode: this.previewMode,
					subtitles: this.subtitleStyle
				},
				selection: {
					selectedCutIds: this.selectedCutIds,
					selectedSlotVariantIds: this.selectedSlotVariantIds
				},
				transcript: {
					text: this.transcriptText,
					wordCount: this.transcriptWords.length,
					words: this.transcriptWords
				},
				llm: {
					rawOutput: safeParseJson(this.analysisLLMOutputJson),
					wordLabels: this.wordLabels,
					labeledWords: labelRows,
					lineSummaries: semanticModel.lineSummaries,
					slotSummaries: semanticModel.slotSummaries,
					variantSummaries: semanticModel.variantSummaries,
					problems: semanticModel.problems
				},
				derived: {
					analysisSegments: this.analysisSegments,
					speechChunks: this.speechChunks,
					slotGroups: this.slotGroups.map((group) => ({
						slotId: group.slotId,
						start: group.start,
						end: group.end,
						lineId: group.lineId,
						lineOrder: group.lineOrder,
						slotOrder: group.slotOrder,
						selectedVariantId:
							this.selectedVariantForGroup(group)?.variantId ?? group.variants[0]?.variantId ?? null,
						variants: group.variants.map((variant) => ({
							id: variant.id,
							label: variant.label,
							status: variant.status,
							variantId: variant.variantId,
							start: variant.start,
							end: variant.end,
							durationMs: variant.durationMs,
							previewText: variant.previewText,
							chunkCount: variant.chunkCount,
							isStitched: variant.isStitched,
							internalPauseDurationMs: variant.internalPauseDurationMs,
							sourceChunks: variant.sourceChunks,
							wordRanges: variant.wordRanges,
							lockGroups: variant.lockGroups
						}))
					})),
					composedAnalysisSegments: this.composedAnalysisSegments,
					playbackSegments: this.playbackSegments,
					cutSegments: this.cutSegments.map((segment) => ({
						...segment,
						isSelected: segment.locked || selectedCutIds.has(segment.id)
					}))
				},
				stats: {
					selectedCutCount: this.selectedCutCount,
					selectedCutDurationMs: this.selectedCutDurationMs,
					cleanDurationMs: this.cleanDurationMs,
					swappableSlotCount: this.swappableSlotCount,
					stitchedVariantCount: this.stitchedVariantCount
				}
			},
			null,
			2
		);
	}

	get workflowSteps(): Array<{ label: string; state: WorkflowStepState; glyph: string }> {
		const steps = [
			"Upload to AssemblyAI",
			"Generate Transcript",
			"Analyze & Find Cuts",
			"Ready"
		];

		return steps.map((label, index) => {
			const number = index + 1;
			const state =
				number < this.workflowStep
					? "done"
					: number === this.workflowStep
						? "active"
						: "pending";

			return {
				label,
				state,
				glyph: state === "done" ? "✓" : state === "active" ? "•" : "—"
			};
		});
	}

	get statusLabel(): string {
		if (!this.selectedFile) return "Awaiting upload";
		if (this.transcribing) return "Uploading to AssemblyAI";
		if (this.analyzing) return "Analyzing transcript";
		if (this.pollingTranscript) {
			const s = this.normalizedTranscriptStatus;
			if (s === "queued") return "Queued for transcription";
			if (s === "processing") return "Transcribing audio";
			return "Fetching transcript status";
		}
		if (this.creatingAutocutJob) return "Building cut preview";
		if (this.isReady) return "Ready";
		return "Queued";
	}

	get statusDescription(): string {
		if (!this.selectedFile) return "Upload a video to begin the editor pipeline.";
		if (this.transcribing) {
			return "Uploading the clip to AssemblyAI.";
		}
		if (this.analyzing) {
			return "Finding cuts and labeling semantic content from the transcript.";
		}
		if (this.pollingTranscript) {
			const s = this.normalizedTranscriptStatus;
			if (s === "queued") {
				return "The transcript request is queued. Processing will begin shortly.";
			}
			if (s === "processing") {
				return "AssemblyAI is transcribing the audio and will return word-level timestamps.";
			}
			return "Checking transcription status with AssemblyAI.";
		}
		if (this.creatingAutocutJob) {
			return "Sending your cut plan to the server to build the preview.";
		}
		if (this.isReady) {
			return "Preview the selected slot mix, inspect pause chunks, and refine the cut plan.";
		}
		return "The upload is queued for processing.";
	}

	get workflowStep(): number {
		if (!this.selectedFile) return 0;
		if (this.isReady) return 5;
		if (this.transcribing) return 1;
		if (this.pollingTranscript) return 2;
		if (this.analyzing) return 3;
		if (this.creatingAutocutJob) return 4;
		return 1;
	}

	get analysisSegments(): AutocutAnalysisSegment[] {
		if (this.transcriptWords.length === 0 || this.wordLabels.length === 0) {
			return [];
		}

		const key = `${this.transcriptWords.length}:${this.wordLabels.length}:${this.deadSpaceThreshold}:${this.clipEndTrim}`;
		if (key === this._cachedAnalysisSegmentsKey && this._cachedAnalysisSegments) {
			return this._cachedAnalysisSegments;
		}

		const result = buildAnalysisSegments(this.transcriptWords, this.wordLabels, {
			deadSpaceThresholdMs: this.deadSpaceThreshold,
			clipEndTrimMs: this.clipEndTrim
		});
		this._cachedAnalysisSegmentsKey = key;
		this._cachedAnalysisSegments = result;
		this._cachedAnalysisSegmentRefs = null; // invalidate dependent cache
		return result;
	}

	get analysisSegmentRefs(): AnalysisSegmentRef<AutocutAnalysisSegment>[] {
		if (this._cachedAnalysisSegmentRefs && this._cachedAnalysisSegmentsKey === `${this.transcriptWords.length}:${this.wordLabels.length}:${this.deadSpaceThreshold}:${this.clipEndTrim}`) {
			return this._cachedAnalysisSegmentRefs;
		}
		const result = buildAnalysisSegmentRefs(this.analysisSegments);
		this._cachedAnalysisSegmentRefs = result;
		return result;
	}

	get speechChunks(): SpeechChunk[] {
		if (this.transcriptWords.length === 0) {
			return [];
		}

		const key = `${this.transcriptWords.length}:${this.wordLabels.length}:${this.deadSpaceThreshold}`;
		if (key === this._cachedSpeechChunksKey && this._cachedSpeechChunks) {
			return this._cachedSpeechChunks;
		}

		const result = buildSpeechChunks(this.transcriptWords, this.wordLabels, this.deadSpaceThreshold);
		this._cachedSpeechChunksKey = key;
		this._cachedSpeechChunks = result;
		return result;
	}

	get slotGroups(): EditorBeatGroup[] {
		return this.semanticModel.slotGroups;
	}

	get beatGroups(): EditorBeatGroup[] {
		return this.slotGroups;
	}

	get stitchedVariantCount(): number {
		return this.slotGroups.filter((group) => {
			const variant = this.selectedVariantForGroup(group);
			return Boolean(variant?.isStitched);
		}).length;
	}

	get swappableSlotGroups(): EditorBeatGroup[] {
		return this.slotGroups.filter((group) => group.variants.length > 1);
	}

	get swappableBeatGroups(): EditorBeatGroup[] {
		return this.swappableSlotGroups;
	}

	get swappableSlotCount(): number {
		return this.swappableSlotGroups.length;
	}

	get swappableBeatCount(): number {
		return this.swappableSlotCount;
	}

	get slotSelectionSignature(): string {
		return this.slotGroups
			.map((group) => `${group.slotId}:${group.variants.map((variant) => variant.id).join(",")}`)
			.join("|");
	}

	get beatSelectionSignature(): string {
		return this.slotSelectionSignature;
	}

	private segmentMatchesSelectedVariant(
		segment: AutocutAnalysisSegment,
		slotId?: string | null,
		variantId?: string | null
	): boolean {
		if (!slotId || !variantId || segment.status === "discarded") return false;

		return segment.slotId === slotId && segment.variantId === variantId;
	}

	private selectedSlotVariantId(slotId: string): string | null {
		const group = this.slotGroups.find((value) => value.slotId === slotId);
		if (!group) return null;

		const selectedVariant = this.selectedVariantForGroup(group);

		return selectedVariant?.variantId ?? group.selectedVariantId ?? null;
	}

	private deadSpaceIsSelectedPath(
		segments: AutocutAnalysisSegment[],
		index: number
	): boolean {
		const current = segments[index];
		if (!current || current.category !== "dead_space") return false;

		let previous: AutocutAnalysisSegment | null = null;
		for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
			if (segments[cursor].category === "dead_space") continue;
			previous = segments[cursor];
			break;
		}

		let next: AutocutAnalysisSegment | null = null;
		for (let cursor = index + 1; cursor < segments.length; cursor += 1) {
			if (segments[cursor].category === "dead_space") continue;
			next = segments[cursor];
			break;
		}

		return Boolean(
			previous &&
			next &&
			previous.slotId &&
			previous.slotId === next.slotId &&
			previous.variantId &&
			previous.variantId === next.variantId &&
			this.segmentMatchesSelectedVariant(
				previous,
				previous.slotId,
				this.selectedSlotVariantId(previous.slotId)
			) &&
			this.segmentMatchesSelectedVariant(next, next.slotId, this.selectedSlotVariantId(next.slotId))
		);
	}

	private normalizedSegment(segment: AutocutAnalysisSegment): AutocutAnalysisSegment {
		if (segment.category === "dead_space") {
			return segment;
		}

		const selectedVariantId = segment.slotId ? this.selectedSlotVariantId(segment.slotId) : null;
		const isSelectedVariant = this.segmentMatchesSelectedVariant(
			segment,
			segment.slotId,
			selectedVariantId
		);

		if (segment.category === "filler_words") {
			if (isSelectedVariant || !segment.slotId) {
				return segment;
			}

			return {
				...segment,
				category: "retake"
			};
		}

		if (isSelectedVariant) {
			return {
				...segment,
				category: "good",
				takeId: segment.variantId ?? segment.takeId ?? null,
				beatId: segment.slotId ?? segment.beatId ?? null
			};
		}

		return {
			...segment,
			category: "retake",
			takeId: segment.variantId ?? segment.takeId ?? null,
			beatId: segment.slotId ?? segment.beatId ?? null
		};
	}

	private segmentIsLocked(
		segment: AutocutAnalysisSegment,
		index: number,
		segments: AutocutAnalysisSegment[]
	): boolean {
		if (segment.category === "retake") return true;
		if (segment.category === "filler_words") {
			return !this.segmentMatchesSelectedVariant(
				segment,
				segment.slotId,
				segment.slotId ? this.selectedSlotVariantId(segment.slotId) : null
			);
		}
		if (segment.category === "dead_space") {
			return !this.deadSpaceIsSelectedPath(segments, index);
		}

		return false;
	}

	private isCutActive(segment: EditorCutSegment, selected: Set<string>): boolean {
		if (segment.locked) return true;
		if (!this.cutToggles[segment.category]) return false;

		return selected.has(segment.id);
	}

	get normalizedAnalysisSegments(): AutocutAnalysisSegment[] {
		return this.analysisSegments.map((segment) => this.normalizedSegment(segment));
	}

	get cutSegments(): EditorCutSegment[] {
		const baseSegments = this.normalizedAnalysisSegments;

		return baseSegments
			.map((segment, index) => {
				if (segment.category === "good") return null;

				const category = segment.category as EditorCutCategory;
				const meta = SEGMENT_META[category];

				return {
					...segment,
					id: this.analysisSegmentRefs[index]?.id ?? segmentId(index),
					category,
					durationMs: Math.max(segment.end - segment.start, 0),
					label: humanizeSegmentText(segment),
					shortLabel: meta.shortLabel,
					color: meta.color,
					locked: this.segmentIsLocked(segment, index, baseSegments)
				} satisfies EditorCutSegment;
			})
			.filter((segment): segment is EditorCutSegment => Boolean(segment));
	}

	get transcriptPanelWords(): EditorTranscriptWord[] {
		if (this.transcriptWords.length === 0) {
			return [];
		}

		const slotMetaById = new Map(
			this.slotGroups.map((group, index) => [
				group.slotId,
				{
					lineLabel: group.lineLabel,
					slotLabel: group.slotLabel,
					playOrder: index + 1
				}
			])
		);

		if (this.analysisSegments.length === 0) {
			return this.transcriptWords.map((word, index) => ({
				id: index,
				text: word.text,
				start: word.start,
				end: word.end,
				cut: null,
				keep: true,
				segmentId: null,
				lineLabel: null,
				slotLabel: null,
				playOrder: null,
				showPlayMarker: false
			}));
		}

		const selected = new Set(this.selectedCutIds);
		const cutSegmentById = new Map(this.cutSegments.map((segment) => [segment.id, segment]));
		const words: EditorTranscriptWord[] = [];
		const syntheticIdOffset = this.transcriptWords.length + 1;

		for (const [index, segment] of this.normalizedAnalysisSegments.entries()) {
			const transcriptSegmentId = this.analysisSegmentRefs[index]?.id ?? segmentId(index);
			const cutSegment = cutSegmentById.get(transcriptSegmentId);
			const keep = !cutSegment || !this.isCutActive(cutSegment, selected);
			const slotMeta =
				segment.category === "good" && segment.slotId
					? slotMetaById.get(segment.slotId)
					: undefined;

			if (segment.category === "dead_space") {
				words.push({
					id: syntheticIdOffset + index,
					text: "",
					start: segment.start,
					end: segment.end,
					cut: "pause",
					keep,
					segmentId: transcriptSegmentId,
					lineLabel: null,
					slotLabel: null,
					playOrder: null,
					showPlayMarker: false
				});
				continue;
			}

			const startIndex = segment.wordStartIndex ?? -1;
			const endIndex = segment.wordEndIndex ?? -1;
			if (startIndex < 0 || endIndex < startIndex) continue;

			for (let wordIndex = startIndex; wordIndex <= endIndex; wordIndex += 1) {
				const word = this.transcriptWords[wordIndex];
				if (!word) continue;

				words.push({
					id: wordIndex,
					text: word.text,
					start: word.start,
					end: word.end,
					cut:
						segment.category === "filler_words"
							? "filler"
							: segment.category === "retake"
								? "restart"
								: null,
					keep,
					segmentId: cutSegment ? transcriptSegmentId : null,
					lineLabel: slotMeta?.lineLabel ?? null,
					slotLabel: slotMeta?.slotLabel ?? null,
					playOrder: slotMeta?.playOrder ?? null,
					showPlayMarker: Boolean(slotMeta && wordIndex === startIndex)
				});
			}
		}

		return words;
	}

	get activeTranscriptWordId(): number | null {
		const currentTimeMs = this.currentTimeMs;
		const words = this.transcriptPanelWords;

		for (const [index, word] of words.entries()) {
			const nextWord = words[index + 1];
			const effectiveEnd = nextWord ? Math.max(word.end, nextWord.start) : word.end;

			if (currentTimeMs >= word.start && currentTimeMs < effectiveEnd) {
				return word.id;
			}
		}

		const lastWord = words[words.length - 1];
		if (lastWord && currentTimeMs >= lastWord.start) {
			return lastWord.id;
		}

		return null;
	}

	get filteredCutSegments(): EditorCutSegment[] {
		if (this.activeFilter === "all") return this.cutSegments;

		return this.cutSegments.filter((segment) => segment.category === this.activeFilter);
	}

	get cutCounts(): Record<EditorFilter, number> {
		return {
			all: this.cutSegments.length,
			filler_words: this.cutSegments.filter((segment) => segment.category === "filler_words").length,
			dead_space: this.cutSegments.filter((segment) => segment.category === "dead_space").length,
			retake: this.cutSegments.filter((segment) => segment.category === "retake").length
		};
	}

	get analysisStats() {
		const values = (Object.keys(SEGMENT_META) as EditorCutCategory[]).map((category) => {
			const items = this.cutSegments.filter((segment) => segment.category === category);
			const durationMs = items.reduce((sum, segment) => sum + segment.durationMs, 0);

			return {
				category,
				label: SEGMENT_META[category].label,
				color: SEGMENT_META[category].color,
				count: items.length,
				durationMs
			};
		});

		const maxCount = Math.max(...values.map((item) => item.count), 0);

		return values.map((item) => ({
			...item,
			fill: maxCount > 0 ? Math.round((item.count / maxCount) * 100) : 0
		}));
	}

	get recommendationText(): string {
		if (!this.selectedFile) {
			return "Upload a clip to inspect the transcript, detected cuts, and the clean preview.";
		}

		if (this.isBusy) {
			return "Counts and recommendations appear here once the transcript and labels are ready.";
		}

		const swapText =
			this.swappableSlotCount > 0
				? `${this.swappableSlotCount} slot${this.swappableSlotCount === 1 ? " has" : "s have"} alternate variants available to swap. `
				: "";
		const stitchText =
			this.stitchedVariantCount > 0
				? `${this.stitchedVariantCount} selected slot${this.stitchedVariantCount === 1 ? " is" : "s are"} stitched across multiple pause-based chunks. `
				: "";

		if (this.cutSegments.length === 0) {
			return (
				`${swapText}${stitchText}` ||
				"No removable filler, pauses, or retakes were detected in the current cut plan."
			);
		}

		const dominant = [...this.analysisStats].sort((a, b) => b.durationMs - a.durationMs)[0];
		return `${swapText}${stitchText}${dominant.label} is the largest cleanup opportunity right now. Current selections remove ${this.formatDuration(
			this.selectedCutDurationMs
		)} across ${this.selectedCutCount} segments and land at ${this.formatClock(this.cleanDurationMs)} clean runtime.`;
	}

	get selectionSignature(): string {
		return this.cutSegments.map((segment) => `${segment.id}:${Number(segment.locked)}`).join("|");
	}

	get syncSignature(): string {
		const file = this.selectedFile;

		if (!file || this.transcriptWords.length === 0 || this.wordLabels.length === 0) {
			return "";
		}

		return JSON.stringify({
			fileName: file.name,
			fileSize: file.size,
			fileLastModified: file.lastModified,
			transcriptId: this.transcriptId,
			selectedCutIds: [...this.selectedCutIds].sort(),
			selectedSlotVariantIds: this.slotGroups.map((group) => [
				group.slotId,
				this.selectedVariantForGroup(group)?.variantId ?? ""
			]),
			cutToggles: this.cutToggles,
			deadSpaceThreshold: this.deadSpaceThreshold,
			clipEndTrim: this.clipEndTrim
		});
	}

	get composedAnalysisSegments(): AutocutAnalysisSegment[] {
		const selected = new Set(this.selectedCutIds);
		const cutSegmentById = new Map(this.cutSegments.map((segment) => [segment.id, segment]));

		return this.normalizedAnalysisSegments.map((segment, index) => {
			if (segment.category === "good") return segment;

			const id = this.analysisSegmentRefs[index]?.id ?? segmentId(index);
			const cutSegment = cutSegmentById.get(id);

			if (!cutSegment) return segment;
			if (cutSegment.locked) return segment;
			if (this.cutToggles[cutSegment.category] && selected.has(id)) {
				return segment;
			}

			return {
				...segment,
				category: "good"
			};
		});
	}

	get playbackSegments(): AutocutAnalysisSegment[] {
		if (this.analysisSegmentRefs.length === 0 || this.slotGroups.length === 0) {
			return [];
		}

		const selected = new Set(this.selectedCutIds);
		const cutSegmentById = new Map(this.cutSegments.map((segment) => [segment.id, segment]));
		const playbackSegments: AutocutAnalysisSegment[] = [];

		for (const group of this.slotGroups) {
			const variant = this.selectedVariantForGroup(group);
			if (!variant) continue;

			const matchingRefIndexes = this.analysisSegmentRefs
				.map((ref, refIndex) => ({ ref, refIndex }))
				.filter(({ ref }) =>
					this.segmentMatchesSelectedVariant(ref.segment, group.slotId, variant.variantId)
				)
				.map(({ refIndex }) => refIndex);

			if (matchingRefIndexes.length === 0) continue;

			const firstIndex = matchingRefIndexes[0];
			const lastIndex = matchingRefIndexes[matchingRefIndexes.length - 1];

			for (let refIndex = firstIndex; refIndex <= lastIndex; refIndex += 1) {
				const ref = this.analysisSegmentRefs[refIndex];
				const segment = this.analysisSegments[refIndex];
				const id = ref.id;
				const cutSegment = cutSegmentById.get(id);

				if (segment.category === "dead_space") {
					if (!this.deadSpaceIsSelectedPath(this.analysisSegments, refIndex)) continue;
					if (cutSegment && this.isCutActive(cutSegment, selected)) continue;

					playbackSegments.push({
						...segment,
						category: "good"
					});
					continue;
				}

				if (!this.segmentMatchesSelectedVariant(segment, group.slotId, variant.variantId)) {
					continue;
				}

				if (segment.category === "filler_words" && cutSegment && this.isCutActive(cutSegment, selected)) {
					continue;
				}

				playbackSegments.push({
					...segment,
					category: "good",
					takeId: variant.variantId,
					beatId: group.slotId
				});
			}
		}

		return buildPlaybackSegments(playbackSegments, this.deadSpaceThreshold, this.analysisSegments);
	}

	get sourceSubtitleCues(): VideoSubtitleCue[] {
		if (!this.subtitleStyle.enabled || this.transcriptWords.length === 0) {
			return [];
		}

		const key = `${this.transcriptWords.length}:${this.totalDurationMs}:${this.videoWidthPx ?? 0}:${this.videoHeightPx ?? 0}:${this.subtitleStyleSignature}`;
		if (key === this._cachedSourceSubtitleCuesKey && this._cachedSourceSubtitleCues) {
			return this._cachedSourceSubtitleCues;
		}

		const cues = buildSourceSubtitleCues(
			this.transcriptWords,
			this.subtitleStyle,
			this.subtitleLayoutContext
		);
		this._cachedSourceSubtitleCuesKey = key;
		this._cachedSourceSubtitleCues = cues;
		return cues;
	}

	get selectedSourceSubtitleCues(): VideoSubtitleCue[] {
		if (!this.subtitleStyle.enabled || this.transcriptWords.length === 0 || this.playbackSegments.length === 0) {
			return [];
		}

		const playbackSignature = this.playbackSegments
			.map((segment) => `${segment.start}-${segment.end}`)
			.join("|");
		const key = `${playbackSignature}:${this.transcriptWords.length}:${this.videoWidthPx ?? 0}:${this.videoHeightPx ?? 0}:${this.subtitleStyleSignature}`;
		if (
			key === this._cachedSelectedSourceSubtitleCuesKey &&
			this._cachedSelectedSourceSubtitleCues
		) {
			return this._cachedSelectedSourceSubtitleCues;
		}

		const cues = buildSelectedSourceSubtitleCues(
			this.playbackSegments,
			this.transcriptWords,
			this.subtitleStyle,
			this.subtitleLayoutContext
		);
		this._cachedSelectedSourceSubtitleCuesKey = key;
		this._cachedSelectedSourceSubtitleCues = cues;
		return cues;
	}

	get exportSubtitleCues(): VideoSubtitleCue[] {
		if (!this.subtitleStyle.enabled || this.transcriptWords.length === 0 || this.playbackSegments.length === 0) {
			return [];
		}

		const playbackSignature = this.playbackSegments
			.map((segment) => `${segment.start}-${segment.end}`)
			.join("|");
		const key = `${playbackSignature}:${this.cleanDurationMs}:${this.videoWidthPx ?? 0}:${this.videoHeightPx ?? 0}:${this.subtitleStyleSignature}`;
		if (key === this._cachedExportSubtitleCuesKey && this._cachedExportSubtitleCues) {
			return this._cachedExportSubtitleCues;
		}

		const cues = buildExportSubtitleCues(
			this.playbackSegments,
			this.transcriptWords,
			this.subtitleStyle,
			this.subtitleLayoutContext
		);
		this._cachedExportSubtitleCuesKey = key;
		this._cachedExportSubtitleCues = cues;
		return cues;
	}

	get exportSubtitlePayload(): VideoSubtitlePayload | null {
		if (!this.subtitleStyle.enabled) return null;
		if (this.exportSubtitleCues.length === 0) return null;

		const style = this.subtitleStyle;

		return {
			cues: this.exportSubtitleCues,
			style: {
				...style,
				position: {
					...style.position
				}
			}
		};
	}

	get previewSubtitleCues(): VideoSubtitleCue[] {
		return this.previewMode === "before"
			? this.sourceSubtitleCues
			: this.selectedSourceSubtitleCues;
	}

	get activeSubtitleCue(): VideoSubtitleCue | null {
		const cues = this.previewSubtitleCues;
		if (cues.length === 0) return null;

		for (const cue of cues) {
			if (this.currentTimeMs >= cue.start && this.currentTimeMs < cue.end) {
				return cue;
			}
		}

		return null;
	}

	get activeSubtitleWordIndex(): number | null {
		return findActiveSubtitleWordIndex(this.activeSubtitleCue, this.currentTimeMs);
	}

	get subtitleOverlayPositionClasses(): string {
		switch (this.subtitleStyle.position.verticalAlign) {
			case "top":
				return "";
			case "middle":
				return "top-1/2 -translate-y-1/2";
			default:
				return "";
		}
	}

	get subtitleOverlayStyle(): string {
		const margin = `${this.subtitleStyle.position.marginYPct}%`;

		switch (this.subtitleStyle.position.verticalAlign) {
			case "top":
				return `top: ${margin};`;
			case "middle":
				return "top: 50%;";
			default:
				return `bottom: ${margin};`;
		}
	}

	get subtitleOverlayBoxStyle(): string {
		const style = this.subtitleStyle;
		const aspectScale =
			(this.videoHeightPx ?? 1080) / Math.max(this.videoWidthPx ?? 1920, 1);
		const fontSizeWidthPct = style.fontSizePctOfHeight * aspectScale;
		const fontSize = `${fontSizeWidthPct}cqi`;
		const horizontalPadding = `${Math.max(fontSizeWidthPct * 0.42, 0.9)}cqi`;
		const verticalPadding = `${Math.max(fontSizeWidthPct * 0.22, 0.45)}cqi`;
		const borderRadius = `${Math.max(fontSizeWidthPct * 0.46, 0.9)}cqi`;

		// Convert hex bg color + opacity to rgba
		const r = parseInt(style.bgColor.slice(1, 3), 16);
		const g = parseInt(style.bgColor.slice(3, 5), 16);
		const b = parseInt(style.bgColor.slice(5, 7), 16);
		const bgRgba = `rgba(${r}, ${g}, ${b}, ${style.bgOpacity})`;

		return [
			`max-width: ${style.maxWidthPct}%`,
			`font-family: ${style.fontFamily}, sans-serif`,
			`font-size: clamp(18px, ${fontSize}, 72px)`,
			`font-weight: ${style.bold ? "700" : "400"}`,
			`line-height: ${style.lineHeight}`,
			`color: ${style.textColor}`,
			`background: ${bgRgba}`,
			`padding: clamp(8px, ${verticalPadding}, 16px) clamp(12px, ${horizontalPadding}, 28px)`,
			`border-radius: clamp(12px, ${borderRadius}, 28px)`,
			`-webkit-text-stroke: ${style.outlineThickness > 0 ? `${style.outlineThickness * 0.3}px ${style.outlineColor}` : "0"}`,
			`text-shadow: ${style.outlineThickness > 0 ? `0 0 ${style.outlineThickness}px ${style.outlineColor}, 0 0 ${style.outlineThickness * 2}px ${style.outlineColor}` : "none"}`
		].join("; ");
	}

	get selectedCutCount(): number {
		const selected = new Set(this.selectedCutIds);

		return this.cutSegments.filter((segment) => this.isCutActive(segment, selected)).length;
	}

	get selectedCutDurationMs(): number {
		const selected = new Set(this.selectedCutIds);

		return this.cutSegments
			.filter((segment) => this.isCutActive(segment, selected))
			.reduce((sum, segment) => sum + segment.durationMs, 0);
	}

	get cleanDurationMs(): number {
		return this.playbackSegments.reduce(
			(sum, segment) => sum + Math.max(segment.end - segment.start, 0),
			0
		);
	}

	get clipStripBeatBlocks(): EditorClipStripBeatBlock[] {
		const beatGroups = this.beatGroups;

		if (beatGroups.length === 0) return [];

		const blocks = beatGroups.map((group, index) => {
			const selectedVariant = this.selectedVariantForGroup(group);
			const maxDurationMs = Math.max(...group.variants.map((variant) => variant.durationMs), 1);
			const widthMs = Math.max(maxDurationMs, 600);
			const startMs = selectedVariant?.start ?? group.variants[0]?.start ?? 0;
			const endMs = startMs + (selectedVariant?.durationMs ?? group.variants[0]?.durationMs ?? 0);

			return {
				id: group.slotId,
				beatId: group.slotId,
				activeLabel: selectedVariant?.label ?? "",
				color: BEAT_COLORS[index % BEAT_COLORS.length],
				humanLabel: humanizeSlotId(group.slotId),
				startMs,
				endMs,
				widthMs,
				variants: group.variants.map((variant) => ({
					id: variant.id,
					variantId: variant.variantId,
					label: variant.label,
					kind: variant.status,
					durationMs: variant.durationMs,
					start: variant.start,
					previewText: variant.previewText,
					isSelected: selectedVariant?.variantId === variant.variantId,
					fillPct: clamp(Math.round((variant.durationMs / maxDurationMs) * 100), 18, 100)
				}))
			};
		});
		const totalWidthMs = blocks.reduce((sum, block) => sum + block.widthMs, 0);

		return blocks.map(({ widthMs, ...block }) => ({
			...block,
			widthPct: Math.max((widthMs / totalWidthMs) * 100, 10)
		}));
	}

	get editedTimelineBlocks(): EditedTimelineBlock[] {
		const beatGroups = this.beatGroups;

		if (beatGroups.length === 0) return [];

		const blocks: EditedTimelineBlock[] = [];
		const colorMap = new Map<string, string>();

		for (const [index, group] of beatGroups.entries()) {
			colorMap.set(group.slotId, BEAT_COLORS[index % BEAT_COLORS.length]);
		}

		// Build ordered beat entries with their selected variants
		const beatEntries = beatGroups
			.map((group, groupIndex) => {
				const variant = this.selectedVariantForSlotId(group.slotId);
				if (!variant) return null;
				return { group, variant, groupIndex };
			})
			.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

		if (beatEntries.length === 0) return [];

		// Collect cut segments between beats
		const composedSegments = this.cutSegments;
		let totalMs = 0;

		for (let i = 0; i < beatEntries.length; i++) {
			const entry = beatEntries[i];
			const { group, variant } = entry;

			// Add cut/gap segments that fall before this beat (after previous beat or start)
			const prevEnd = i > 0 ? beatEntries[i - 1].variant.end : 0;
			const gapStart = prevEnd;
			const gapEnd = variant.start;

			if (gapEnd > gapStart) {
				// Find cuts in this gap region
				const cutsInGap = composedSegments.filter(
					(seg) => seg.start >= gapStart && seg.end <= gapEnd
				);
				const cutDuration = cutsInGap.reduce((sum, seg) => sum + Math.max(seg.end - seg.start, 0), 0);

				if (cutDuration > 0) {
					const cutLabel = cutsInGap.length === 1
						? SEGMENT_META[cutsInGap[0].category as EditorCutCategory]?.shortLabel ?? "Cut"
						: `${cutsInGap.length} cuts`;

					blocks.push({
						id: `cut-before-${group.slotId}`,
						kind: "cut",
						beatId: null,
						label: cutLabel,
						humanLabel: cutLabel,
						durationMs: cutDuration,
						widthPct: 0,
						color: "#ef4444",
						startMs: gapStart
					});
					totalMs += cutDuration;
				}

				const remainingGap = (gapEnd - gapStart) - cutDuration;
				if (remainingGap > 200) {
					blocks.push({
						id: `gap-before-${group.slotId}`,
						kind: "gap",
						beatId: null,
						label: "",
						humanLabel: "",
						durationMs: remainingGap,
						widthPct: 0,
						color: "#1a1a1a",
						startMs: gapStart + cutDuration
					});
					totalMs += remainingGap;
				}
			}

			// Add beat block
			const text = variant.previewText;
			const label = text.length > 20 ? text.slice(0, 19) + "…" : text;

			blocks.push({
				id: `beat-${group.slotId}`,
				kind: "beat",
				beatId: group.slotId,
				label,
				humanLabel: humanizeSlotId(group.slotId),
				durationMs: variant.durationMs,
				widthPct: 0,
				color: colorMap.get(group.slotId) ?? BEAT_COLORS[0],
				startMs: variant.start
			});
			totalMs += variant.durationMs;
		}

		if (totalMs <= 0) return [];

		return blocks.map((block) => ({
			...block,
			widthPct: Math.max((block.durationMs / totalMs) * 100, block.kind === "beat" ? 3 : 1.5)
		}));
	}

	/** Full uncut timeline — all segments shown at original durations for "before" preview. */
	get beforeTimelineBlocks(): EditedTimelineBlock[] {
		const composedSegments = this.composedAnalysisSegments;
		if (composedSegments.length === 0) return [];

		const beatGroups = this.beatGroups;
		const colorMap = new Map<string, string>();
		for (const [index, group] of beatGroups.entries()) {
			colorMap.set(group.slotId, BEAT_COLORS[index % BEAT_COLORS.length]);
		}

		const blocks: EditedTimelineBlock[] = [];
		let totalMs = 0;

		for (const [index, seg] of composedSegments.entries()) {
			const durationMs = Math.max(seg.end - seg.start, 0);
			if (durationMs <= 0) continue;

			const isGood = seg.category === "good";
			const slotId = seg.beatId ?? null;

			blocks.push({
				id: `before-${index}`,
				kind: isGood ? "beat" : "cut",
				beatId: slotId,
				label: isGood
					? (slotId ? humanizeSlotId(slotId) : "Keep")
					: (SEGMENT_META[seg.category as EditorCutCategory]?.shortLabel ?? seg.category),
				humanLabel: isGood
					? (slotId ? humanizeSlotId(slotId) : "")
					: "",
				durationMs,
				widthPct: 0,
				color: isGood
					? (slotId ? (colorMap.get(slotId) ?? BEAT_COLORS[0]) : "#22c55e")
					: "#ef4444",
				startMs: seg.start
			});
			totalMs += durationMs;
		}

		if (totalMs <= 0) return [];

		return blocks.map((block) => ({
			...block,
			widthPct: Math.max((block.durationMs / totalMs) * 100, 1.5)
		}));
	}

	selectedVariantForSlotId(slotId: string): EditorBeatVariant | undefined {
		const group = this.slotGroups.find((g) => g.slotId === slotId);
		if (!group) return undefined;
		return this.selectedVariantForGroup(group);
	}

	selectedVariantForBeatId(beatId: string): EditorBeatVariant | undefined {
		return this.selectedVariantForSlotId(beatId);
	}

	get clipStripSegments() {
		const totalDurationMs = this.totalDurationMs;

		if (totalDurationMs <= 0) return [];

		return this.composedAnalysisSegments.map((segment, index) => {
			const widthPct = Math.max(((segment.end - segment.start) / totalDurationMs) * 100, 0.5);

			return {
				id: segmentId(index),
				type: segment.category,
				start: segment.start,
				end: segment.end,
				widthPct,
				label: segment.category === "good" ? null : clipStripLabel(segment)
			};
		});
	}

	get timelineBars(): number[] {
		const totalDurationMs = this.totalDurationMs;

		if (this.transcriptWords.length === 0 || totalDurationMs <= 0) {
			return [];
		}

		const buckets = Array.from({ length: TIMELINE_BAR_COUNT }, () => 0);

		for (const word of this.transcriptWords) {
			const start = clamp(Math.floor((word.start / totalDurationMs) * TIMELINE_BAR_COUNT), 0, TIMELINE_BAR_COUNT - 1);
			const end = clamp(Math.floor((word.end / totalDurationMs) * TIMELINE_BAR_COUNT), 0, TIMELINE_BAR_COUNT - 1);

			for (let index = start; index <= end; index += 1) {
				buckets[index] += Math.max(word.confidence, 0.25);
			}
		}

		const maxValue = Math.max(...buckets, 1);

		return buckets.map((value) => 6 + Math.round((value / maxValue) * 24));
	}

	get timelineLabels() {
		const totalDurationMs = this.totalDurationMs;

		if (totalDurationMs <= 0) return [];

		return Array.from({ length: TIMELINE_LABEL_COUNT + 1 }, (_, index) => {
			const ms = Math.round((totalDurationMs / TIMELINE_LABEL_COUNT) * index);

			return {
				id: `${index}-${ms}`,
				label: this.formatClock(ms)
			};
		});
	}

	get jobId(): string {
		return this.job?.id ?? "";
	}

	formatClock(ms: number): string {
		const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
		}

		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	}

	formatTimestamp(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const millis = ms % 1000;

		return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
	}

	formatDuration(ms: number): string {
		if (ms < 1000) return `${ms} ms`;

		const totalSeconds = Math.round(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		if (minutes === 0) return `${seconds}s`;

		return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
	}

	formatSegmentDuration(ms: number): string {
		if (ms < 1000) return `${ms} ms`;

		return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
	}

	miniBarHeights(segment: EditorCutSegment): number[] {
		const wordCount = segment.text.trim() ? segment.text.trim().split(/\s+/).length : 1;
		const base = clamp(Math.round(segment.durationMs / 90), 3, 12);

		return Array.from({ length: 8 }, (_, index) =>
			clamp(base + ((wordCount + index * 2) % 7), 4, 16)
		);
	}

	private selectedVariantForGroup(group: EditorBeatGroup): EditorBeatVariant | undefined {
		const selectedId = this.selectedSlotVariantIds[group.slotId];

		return (
			group.variants.find(
				(variant) => variant.variantId === selectedId || variant.id === selectedId
			) ?? group.variants[0]
		);
	}

	setVideoElement(element: HTMLVideoElement | null) {
		if (this.videoElement === element) return;

		this.stopPreview();
		this.videoElement = element;
	}

	setVideoDuration(durationSeconds: number) {
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			this.videoDurationMs = null;
			return;
		}

		this.videoDurationMs = Math.round(durationSeconds * 1000);
	}

	setVideoMetadata(video: HTMLVideoElement | null) {
		this.setVideoDuration(video?.duration ?? 0);
		this.videoWidthPx =
			video && Number.isFinite(video.videoWidth) && video.videoWidth > 0
				? Math.round(video.videoWidth)
				: null;
		this.videoHeightPx =
			video && Number.isFinite(video.videoHeight) && video.videoHeight > 0
				? Math.round(video.videoHeight)
				: null;
	}

	updateCurrentTime(currentTimeSeconds: number) {
		this.currentTimeMs = Math.max(Math.round(currentTimeSeconds * 1000), 0);
	}

	seekTo(timeMs: number) {
		if (!this.videoElement) return;
		this.videoElement.currentTime = timeMs / 1000;
		this.currentTimeMs = Math.max(Math.round(timeMs), 0);
	}

	handleBeforePlaybackEnded() {
		if (this.previewMode !== "before") return;

		this.isPreviewPlaying = false;
		this.currentPreviewSegmentIndex = 0;
	}

	setPreviewMode(mode: "before" | "after") {
		if (this.previewMode === mode) return;

		this.stopPreview();
		this.previewMode = mode;
	}

	async previewAppliedCuts() {
		if (!this.videoElement) return;

		if (this.previewMode === "before") {
			if (this.isPreviewPlaying) {
				this.stopPreview();
				return;
			}

			this.clearPreviewListeners();
			this.isPreviewPlaying = true;

			const handleEnded = () => {
				this.handleBeforePlaybackEnded();
			};

			this.previewEndedHandler = handleEnded;
			this.videoElement.addEventListener("ended", handleEnded);
			await this.videoElement.play().catch(() => undefined);
			return;
		}

		if (this.isPreviewPlaying) {
			this.stopPreview();
			return;
		}

		const segments = this.playbackSegments;

		if (segments.length === 0) return;

		this.isPreviewPlaying = true;
		this.currentPreviewSegmentIndex = 0;
		await this.playSegment(0, segments);
	}

	stopPreview() {
		this.clearPreviewListeners();
		this.videoElement?.pause();
		this.isPreviewPlaying = false;
		this.currentPreviewSegmentIndex = 0;
	}

	async exportSelectedCuts() {
		if (!browser) return;
		if (this.exporting) return;

		const file = this.selectedFile;
		const segments = this.playbackSegments;

		if (!file || segments.length === 0) {
			this.exportError = "No edited timeline is ready to export yet.";
			return;
		}

		let exportUrl: string | null = null;

		this.stopPreview();
		this.exporting = true;
		this.exportError = "";

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append(
				"segments",
				JSON.stringify(
					segments.map((segment) => ({
						start: segment.start,
						end: segment.end
					}))
				)
			);
			formData.append("fileName", file.name);
			if (this.exportSubtitlePayload) {
				formData.append("subtitles", JSON.stringify(this.exportSubtitlePayload));
			}

			const response = await fetch("/api/video/export", {
				method: "POST",
				body: formData
			});

			if (!response.ok) {
				const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(errorBody?.error ?? "Server export failed.");
			}

			const renderedBlob = await response.blob();
			if (renderedBlob.size === 0) {
				throw new Error("The server returned an empty MP4.");
			}

			exportUrl = URL.createObjectURL(renderedBlob);
			const link = document.createElement("a");
			link.href = exportUrl;
			link.download =
				parseContentDispositionFileName(response.headers.get("content-disposition")) ??
				buildExportFileName(file.name);
			link.click();
		} catch (error) {
			this.exportError = error instanceof Error ? error.message : "Export failed.";
		} finally {
			this.exporting = false;

			if (exportUrl) {
				const urlToRevoke = exportUrl;
				window.setTimeout(() => {
					URL.revokeObjectURL(urlToRevoke);
				}, 30_000);
			}
		}
	}

	async setFile(file: File | null) {
		if (!browser) return;

		this.currentRun += 1;
		this.activeJobSyncToken += 1;
		this.lastSyncSignature = "";
		this.lastSelectionSignature = "";
		this.stopPreview();
		this.clearTranscriptPolling();

		if (this.videoUrl) {
			URL.revokeObjectURL(this.videoUrl);
		}

		this.selectedFile = file;
		this.videoUrl = file ? URL.createObjectURL(file) : null;
		this.videoDurationMs = null;
		this.videoWidthPx = null;
		this.videoHeightPx = null;
		this.currentTimeMs = 0;
		this.previewMode = file ? "before" : "after";
		this.activeFilter = "all";
		this.selectedCutIds = [];
		this.selectedSlotVariantIds = {};
		this.transcribing = false;
		this.pollingTranscript = false;
		this.analyzing = false;
		this.creatingAutocutJob = false;
		this.transcriptId = "";
		this.transcriptStatus = "";
		this.transcriptText = "";
		this.transcriptWords = [];
		this.wordLabels = [];
		this.analysisLLMOutputJson = "";
		this.transcriptError = "";
		this.analysisError = "";
		this.jobError = "";
		this.exportError = "";
		this.job = null;
		this.cutToggles = {
			filler_words: true,
			dead_space: true,
			retake: true
		};
		this._cachedSourceSubtitleCuesKey = "";
		this._cachedSourceSubtitleCues = null;
		this._cachedSelectedSourceSubtitleCuesKey = "";
		this._cachedSelectedSourceSubtitleCues = null;
		this._cachedExportSubtitleCuesKey = "";
		this._cachedExportSubtitleCues = null;
		this.lastBeatSelectionSignature = "";
	}

	syncSelectionWithSegments(signature: string) {
		if (signature === this.lastSelectionSignature) return;

		this.lastSelectionSignature = signature;
		this.selectedCutIds = this.cutSegments
			.filter((segment) => !segment.locked)
			.map((segment) => segment.id);
	}

	syncBeatSelections(signature: string) {
		if (signature === this.lastBeatSelectionSignature) return;

		this.lastBeatSelectionSignature = signature;
		const nextSelections: Record<string, string> = {};

		for (const group of this.slotGroups) {
			const existing = this.selectedSlotVariantIds[group.slotId];
			const selectedVariant =
				group.variants.find(
					(variant) => variant.variantId === existing || variant.id === existing
				) ?? group.variants[0];
			nextSelections[group.slotId] = selectedVariant?.variantId ?? "";
		}

		this.selectedSlotVariantIds = nextSelections;
	}

	toggleCutSelection(id: string) {
		const segment = this.cutSegments.find((value) => value.id === id);
		if (segment?.locked) return;

		if (this.selectedCutIds.includes(id)) {
			this.selectedCutIds = this.selectedCutIds.filter((value) => value !== id);
			return;
		}

		this.selectedCutIds = [...this.selectedCutIds, id];
	}

	selectAllCuts() {
		this.selectedCutIds = this.cutSegments
			.filter((segment) => !segment.locked)
			.map((segment) => segment.id);
	}

	clearSelectedCuts() {
		this.selectedCutIds = [];
	}

	toggleTranscriptGroup(wordIds: number[]) {
		const transcriptWords = this.transcriptPanelWords;
		const segmentIds = [...new Set(
			wordIds
				.map((id) => transcriptWords.find((word) => word.id === id)?.segmentId ?? null)
				.filter((segmentId): segmentId is string => Boolean(segmentId))
		)];

		if (segmentIds.length === 0) return;

		const cutSegments = new Map(this.cutSegments.map((segment) => [segment.id, segment]));
		const activeSelection = new Set(this.selectedCutIds);
		const shouldRestore = segmentIds.every((id) => {
			const segment = cutSegments.get(id);
			return segment ? this.isCutActive(segment, activeSelection) : false;
		});

		if (shouldRestore) {
			this.selectedCutIds = this.selectedCutIds.filter((id) => {
				const segment = cutSegments.get(id);
				return !segmentIds.includes(id) || Boolean(segment?.locked);
			});
			return;
		}

		const nextSelected = new Set(this.selectedCutIds);
		for (const id of segmentIds) {
			const segment = cutSegments.get(id);
			if (!segment || segment.locked) continue;
			nextSelected.add(id);
		}
		this.selectedCutIds = [...nextSelected];
	}

	selectSlotVariant(slotId: string, variantId: string) {
		if (this.selectedSlotVariantIds[slotId] === variantId) return;

		this.stopPreview();
		this.selectedSlotVariantIds = {
			...this.selectedSlotVariantIds,
			[slotId]: variantId
		};
	}

	selectBeatVariant(beatId: string, variantId: string) {
		this.selectSlotVariant(beatId, variantId);
	}

	async maybeStartProcessing() {
		if (!browser) return;
		if (!this.selectedFile || this.isBusy) return;
		if (this.transcriptId || this.transcriptWords.length > 0 || this.wordLabels.length > 0) return;
		if (this.transcriptError || this.analysisError) return;

		await this.transcribe();
	}

	async maybeSyncAutocutJob(signature: string) {
		if (!browser) return;
		if (!signature || signature === this.lastSyncSignature || this.analyzing) return;

		const file = this.selectedFile;
		if (!file) return;

		const syncToken = ++this.activeJobSyncToken;
		this.lastSyncSignature = signature;
		this.creatingAutocutJob = true;
		this.jobError = "";

		try {
			const payload: CreateAutocutJobRequest = {
				fileName: file.name,
				mimeType: file.type || "video/mp4",
				sizeBytes: file.size,
				durationMs: this.totalDurationMs || undefined,
				metadata: {
					source: "video-editor"
				},
				options: {
					renderOutput: false,
					trimFillerWords: this.cutToggles.filler_words,
					removeSilence: this.cutToggles.dead_space,
					detectRetakes: this.cutToggles.retake
				},
				transcriptText: this.transcriptText,
				transcriptWords: this.transcriptWords,
				analysisSegments: this.composedAnalysisSegments
			};

			const res = await fetch("/api/video/autocut", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			});

			const data = (await res.json()) as Partial<AutocutJobResponse> & { error?: string };

			if (syncToken !== this.activeJobSyncToken || signature !== this.syncSignature) return;

			if (!res.ok || !data.job?.id) {
				this.jobError = data.error ?? "Failed to create the autocut job.";
				return;
			}

			this.job = data.job;
		} catch (error) {
			if (syncToken !== this.activeJobSyncToken || signature !== this.syncSignature) return;
			this.jobError = error instanceof Error ? error.message : "Autocut job request failed.";
		} finally {
			if (syncToken === this.activeJobSyncToken && signature === this.syncSignature) {
				this.creatingAutocutJob = false;
			}
		}
	}

	async pollJob() {
		if (!this.jobId) return;

		try {
			const res = await fetch(`/api/video/autocut/${this.jobId}`);
			const data = (await res.json()) as Partial<AutocutJobResponse> & { error?: string };

			if (!res.ok || !data.job) {
				this.jobError = data.error ?? "Failed to refresh the autocut job.";
				return;
			}

			this.job = data.job;
			this.jobError = "";
		} catch (error) {
			this.jobError = error instanceof Error ? error.message : "Failed to refresh the autocut job.";
		}
	}

	private clearTranscriptPolling() {
		if (!this.transcriptPollDelay) return;

		clearTimeout(this.transcriptPollDelay);
		this.transcriptPollDelay = null;
	}

	private get normalizedTranscriptStatus(): string {
		return this.transcriptStatus.trim().toLowerCase();
	}

	private waitForNextTranscriptPoll(ms: number): Promise<void> {
		return new Promise((resolve) => {
			this.clearTranscriptPolling();
			this.transcriptPollDelay = setTimeout(() => {
				this.transcriptPollDelay = null;
				resolve();
			}, ms);
		});
	}

	private clearPreviewListeners() {
		if (this.previewRafId !== null) {
			cancelAnimationFrame(this.previewRafId);
			this.previewRafId = null;
		}

		if (this.videoElement && this.previewTimeUpdateHandler) {
			this.videoElement.removeEventListener("timeupdate", this.previewTimeUpdateHandler);
		}

		if (this.videoElement && this.previewEndedHandler) {
			this.videoElement.removeEventListener("ended", this.previewEndedHandler);
		}

		this.previewTimeUpdateHandler = null;
		this.previewEndedHandler = null;
	}

	private async seekPreviewTo(timeMs: number) {
		const video = this.videoElement;
		if (!video) return;

		await this.seekVideoElementTo(video, timeMs);
	}

	private async seekVideoElementTo(video: HTMLVideoElement, timeMs: number) {
		const targetSeconds = Math.max(timeMs, 0) / 1000;
		if (Math.abs(video.currentTime - targetSeconds) <= PREVIEW_EPSILON_MS / 1000) {
			return;
		}

		await new Promise<void>((resolve) => {
			let done = false;
			let timeoutId: ReturnType<typeof setTimeout> | null = null;

			const cleanup = () => {
				if (done) return;
				done = true;
				video.removeEventListener("seeked", handleSettled);
				if (timeoutId) clearTimeout(timeoutId);
				resolve();
			};

			const handleSettled = () => {
				if (Math.abs(video.currentTime - targetSeconds) <= PREVIEW_EPSILON_MS / 1000) {
					cleanup();
				}
			};

			video.addEventListener("seeked", handleSettled);
			timeoutId = setTimeout(cleanup, PREVIEW_SEEK_SETTLE_MS);

			// Always use exact seek (currentTime) instead of fastSeek,
			// which snaps to the nearest keyframe and causes audio stutter at cut boundaries
			video.currentTime = targetSeconds;
		});
	}

	private async playSegment(index: number, segments: AutocutAnalysisSegment[]) {
		if (!this.videoElement) return;

		if (index >= segments.length) {
			console.log(`[preview] all ${segments.length} segments done`);
			this.stopPreview();
			return;
		}

		this.currentPreviewSegmentIndex = index;
		const segment = segments[index];

		console.log(`[preview] segment ${index}/${segments.length}: "${segment.text}" start=${segment.start}ms end=${segment.end}ms`);

		// Pause before seeking to prevent audio from the old position bleeding through
		this.videoElement.pause();
		await this.seekPreviewTo(segment.start);
		this.currentTimeMs = Math.max(Math.round(segment.start), 0);
		console.log(`[preview]   seeked to ${(this.videoElement.currentTime * 1000).toFixed(1)}ms (target ${segment.start}ms)`);

		// Use requestAnimationFrame (~16ms) instead of timeupdate (~250ms) for tight cuts
		let hasEnteredRange = false;
		const pollEnd = () => {
			if (!this.videoElement) return;
			const nowMs = this.videoElement.currentTime * 1000;
			this.currentTimeMs = Math.max(Math.round(nowMs), 0);

			// Track whether we've actually entered the segment's time range.
			// This prevents a false "end" trigger when a backward seek hasn't
			// fully settled and currentTime is still beyond segment.end.
			if (!hasEnteredRange) {
				if (nowMs >= segment.start - PREVIEW_EPSILON_MS && nowMs < segment.end + PREVIEW_EPSILON_MS) {
					hasEnteredRange = true;
				} else {
					// Not in range yet — keep polling
					this.previewRafId = requestAnimationFrame(pollEnd);
					return;
				}
			}

			if (nowMs >= segment.end) {
				console.log(`[preview]   hit end at ${nowMs.toFixed(1)}ms (overshot ${(nowMs - segment.end).toFixed(1)}ms)`);
				this.videoElement.pause();
				this.clearPreviewListeners();
				void this.playSegment(index + 1, segments);
				return;
			}

			this.previewRafId = requestAnimationFrame(pollEnd);
		};

		this.previewRafId = requestAnimationFrame(pollEnd);
		await this.videoElement.play().catch(() => undefined);
	}

	private async transcribe() {
		if (!this.selectedFile) return;

		const runId = ++this.currentRun;
		this.transcribing = true;
		this.transcriptError = "";
		this.analysisError = "";
		this.jobError = "";
		this.job = null;
		this.transcriptId = "";
		this.transcriptStatus = "";
		this.transcriptText = "";
		this.transcriptWords = [];
		this.wordLabels = [];
		this.analysisLLMOutputJson = "";
		this.selectedBeatVariantIds = {};
		this.lastBeatSelectionSignature = "";

		try {
			const formData = new FormData();
			formData.append("file", this.selectedFile);

			const res = await fetch("/api/video/transcribe", {
				method: "POST",
				body: formData
			});

			const data = (await res.json()) as { transcript_id?: string; status?: string; error?: string };

			if (runId !== this.currentRun) return;

			if (!res.ok || !data.transcript_id) {
				this.transcriptError = data.error ?? "Failed to start transcription.";
				return;
			}

			this.transcriptId = data.transcript_id;
			this.transcriptStatus = data.status ?? "queued";
			this.transcribing = false;
			await this.pollTranscript(runId, data.transcript_id);
		} catch (error) {
			if (runId !== this.currentRun) return;
			this.transcriptError = error instanceof Error ? error.message : "Transcription request failed.";
		} finally {
			if (runId === this.currentRun) {
				this.transcribing = false;
			}
		}
	}

	private async analyzeTranscript(runId: number) {
		if (this.transcriptWords.length === 0) return;

		this.analyzing = true;
		this.analysisError = "";
		this.analysisLLMOutputJson = "";

		try {
			const res = await fetch("/api/video/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					words: this.transcriptWords
				})
			});

			const data = (await res.json()) as AnalyzeTranscriptResponse & { error?: string };

			if (runId !== this.currentRun) return;

			this.analysisLLMOutputJson = data.llmOutput
				? JSON.stringify(data.llmOutput, null, 2)
				: "";

			if (!res.ok || !Array.isArray(data.labels)) {
				this.analysisError = data.error ?? "Transcript analysis failed.";
				return;
			}

			this.wordLabels = data.labels;
		} catch (error) {
			if (runId !== this.currentRun) return;
			this.analysisError = error instanceof Error ? error.message : "Analysis request failed.";
		} finally {
			if (runId === this.currentRun) {
				this.analyzing = false;
			}
		}
	}

	private async pollTranscript(runId: number, transcriptId: string) {
		if (!transcriptId || runId !== this.currentRun) return;

		this.pollingTranscript = true;

		try {
			while (runId === this.currentRun) {
				const res = await fetch(`/api/video/transcribe/${transcriptId}`);
				const data = await res.json();

				if (runId !== this.currentRun) return;

				if (!res.ok) {
					this.transcriptError = data.error ?? `Failed to fetch transcript (${res.status}).`;
					return;
				}

				this.transcriptStatus = data.status ?? "";

				if (data.status === "completed") {
					this.transcriptText = data.text ?? "";
					this.transcriptWords = Array.isArray(data.words) ? data.words : [];

					if (this.transcriptWords.length === 0) {
						this.transcriptError = "Transcription completed without word timestamps.";
						return;
					}

					this.pollingTranscript = false;
					await this.analyzeTranscript(runId);
					return;
				}

				if (data.status === "error") {
					this.transcriptError = data.error ?? "Transcription failed.";
					return;
				}

				await this.waitForNextTranscriptPoll(3000);
			}
		} catch (error) {
			if (runId !== this.currentRun) return;
			this.transcriptError = error instanceof Error ? error.message : "Transcript polling failed.";
		} finally {
			if (runId === this.currentRun) {
				this.pollingTranscript = false;
				this.clearTranscriptPolling();
			}
		}
	}
}

export const videoEditorState = new VideoEditorState();
