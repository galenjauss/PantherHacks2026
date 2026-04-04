export const AUTOCUT_JOB_STATUSES = [
	"queued",
	"transcribing",
	"planning",
	"rendering",
	"completed",
	"failed"
] as const;

export type AutocutJobStatus = (typeof AUTOCUT_JOB_STATUSES)[number];

export const AUTOCUT_STAGE_STATUSES = ["pending", "processing", "completed", "failed"] as const;

export type AutocutStageStatus = (typeof AUTOCUT_STAGE_STATUSES)[number];

export const AUTOCUT_TARGET_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

export type AutocutTargetAspectRatio = (typeof AUTOCUT_TARGET_ASPECT_RATIOS)[number];

export const AUTOCUT_OUTPUT_FORMATS = ["mp4", "mov"] as const;

export type AutocutOutputFormat = (typeof AUTOCUT_OUTPUT_FORMATS)[number];

export type AutocutDecisionAction = "keep" | "cut" | "trim";

export type AutocutDecisionCategory =
	| "hook"
	| "context"
	| "demo"
	| "filler"
	| "retake"
	| "silence"
	| "payoff"
	| "cta";

export interface AutocutJobOptions {
	removeSilence: boolean;
	trimFillerWords: boolean;
	detectRetakes: boolean;
	renderOutput: boolean;
	targetAspectRatio: AutocutTargetAspectRatio;
	outputFormat: AutocutOutputFormat;
}

export const DEFAULT_AUTOCUT_JOB_OPTIONS: AutocutJobOptions = {
	removeSilence: true,
	trimFillerWords: true,
	detectRetakes: true,
	renderOutput: true,
	targetAspectRatio: "16:9",
	outputFormat: "mp4"
};

export interface CreateAutocutJobRequest {
	sourceUrl?: string;
	fileName?: string;
	mimeType?: string;
	sizeBytes?: number;
	durationMs?: number;
	language?: string;
	speakersExpected?: number;
	metadata?: Record<string, string>;
	options?: Partial<AutocutJobOptions>;
	transcriptText?: string;
	transcriptWords?: AutocutTranscriptWord[];
	analysisSegments?: AutocutAnalysisSegment[];
}

export interface AutocutSource {
	fileName: string;
	mimeType: string;
	sizeBytes: number | null;
	durationMs: number;
	sourceUrl: string | null;
}

export interface AutocutTranscriptWord {
	text: string;
	start: number;
	end: number;
	confidence: number;
}

export const WORD_STATUSES = [
	"selected",
	"alternate",
	"filler",
	"discarded"
] as const;

export type WordStatus = (typeof WORD_STATUSES)[number];

export interface WordSemanticLabel {
	index: number;
	lineId: string | null;
	lineOrder: number | null;
	slotId: string | null;
	slotOrder: number | null;
	variantId: string | null;
	lockId: string | null;
	status: WordStatus;
}

export interface SlotVariantLockGroup {
	lockId: string | null;
	wordStartIndex: number;
	wordEndIndex: number;
	text: string;
}

export interface SlotVariantSpan {
	lineId: string;
	lineOrder: number;
	slotId: string;
	slotOrder: number;
	variantId: string;
	lockGroups: SlotVariantLockGroup[];
	wordRanges: Array<[number, number]>;
	text: string;
	status: "selected" | "alternate";
}

export interface SpeechChunkPause {
	afterWordIndex: number;
	durationMs: number;
}

export interface SpeechChunk {
	chunkId: string;
	wordStartIndex: number;
	wordEndIndex: number;
	start: number;
	end: number;
	text: string;
	internalPauses: SpeechChunkPause[];
	durationMs: number;
	lineIds: string[];
	slotIds: string[];
	variantIds: string[];
	statuses: WordStatus[];
}

export interface LineSlot {
	lineId: string;
	lineOrder: number;
	slotId: string;
	slotOrder: number;
	selectedVariantId: string | null;
	variants: SlotVariantSpan[];
}

export interface DebugLineSummary {
	lineId: string;
	lineOrder: number;
	slotIds: string[];
	selectedVariantIds: string[];
	text: string;
	selectedText: string;
	wordRange: {
		start: number | null;
		end: number | null;
	};
}

export interface DebugSlotSummary {
	lineId: string;
	lineOrder: number;
	slotId: string;
	slotOrder: number;
	selectedVariantId: string | null;
	text: string;
	selectedText: string;
	variantIds: string[];
	wordRange: {
		start: number | null;
		end: number | null;
	};
}

export interface DebugVariantSummary {
	lineId: string;
	lineOrder: number;
	slotId: string;
	slotOrder: number;
	variantId: string;
	status: "selected" | "alternate";
	text: string;
	wordRanges: Array<[number, number]>;
	lockGroups: SlotVariantLockGroup[];
	chunkIds: string[];
	chunkCount: number;
}

export interface DebugProblem {
	type:
		| "slot_selected_variant_missing_words"
		| "slot_multiple_selected_variants"
		| "slot_has_no_selected_variant"
		| "variant_spans_multiple_chunks"
		| "slot_has_only_discarded_words"
		| "filler_inside_selected_lock"
		| "selected_variant_conflicts_with_alternate"
		| "line_has_gap_in_selected_slots";
	lineId?: string | null;
	slotId?: string | null;
	variantId?: string | null;
	message: string;
}

export interface SemanticDebugPayload {
	lineSummaries: DebugLineSummary[];
	slotSummaries: DebugSlotSummary[];
	variantSummaries: DebugVariantSummary[];
	problems: DebugProblem[];
}

export interface AnalyzeTranscriptResponse {
	labels: WordSemanticLabel[];
	llmOutput: unknown;
	debug?: SemanticDebugPayload;
}

export interface AutocutTranscriptSegment {
	id: string;
	speaker: string;
	startMs: number;
	endMs: number;
	text: string;
	confidence: number;
}

export type AutocutAnalysisSegmentCategory =
	| "good"
	| "filler_words"
	| "retake"
	| "dead_space";

export interface AutocutAnalysisSegment {
	start: number;
	end: number;
	category: AutocutAnalysisSegmentCategory;
	text: string;
	wordStartIndex?: number | null;
	wordEndIndex?: number | null;
	lineId?: string | null;
	lineOrder?: number | null;
	slotId?: string | null;
	slotOrder?: number | null;
	variantId?: string | null;
	lockId?: string | null;
	status?: WordStatus | null;
	takeId?: string | null;
	unitId?: string | null;
	unitOrder?: number | null;
	beatId?: string | null;
}

export interface AutocutTranscript {
	language: string;
	durationMs: number;
	generatedAt: string;
	segments: AutocutTranscriptSegment[];
}

export interface AutocutEditDecision {
	id: string;
	action: AutocutDecisionAction;
	category: AutocutDecisionCategory;
	label: string;
	reason: string;
	startMs: number;
	endMs: number;
	lineId?: string | null;
	slotId?: string | null;
	variantId?: string | null;
	takeId?: string | null;
	beatId?: string | null;
}

export interface AutocutEditPlan {
	generatedAt: string;
	summary: string;
	estimatedOutputDurationMs: number;
	decisions: AutocutEditDecision[];
}

export interface AutocutRenderOutput {
	fileName: string;
	mimeType: string;
	durationMs: number;
	playbackUrl: string | null;
	downloadUrl: string | null;
	status: "placeholder" | "ready";
	notes: string[];
}

export interface AutocutJobStage<TOutput> {
	status: AutocutStageStatus;
	progress: number;
	startedAt: string | null;
	completedAt: string | null;
	output: TOutput | null;
	error: string | null;
}

export interface AutocutJob {
	id: string;
	status: AutocutJobStatus;
	progress: number;
	currentStep: string;
	nextPollAfterMs: number;
	createdAt: string;
	updatedAt: string;
	language: string;
	speakersExpected: number | null;
	source: AutocutSource;
	options: AutocutJobOptions;
	metadata: Record<string, string>;
	stages: {
		transcription: AutocutJobStage<AutocutTranscript>;
		planning: AutocutJobStage<AutocutEditPlan>;
		rendering: AutocutJobStage<AutocutRenderOutput>;
	};
}

export interface AutocutJobResponse {
	job: AutocutJob;
}

export interface AutocutJobListResponse {
	jobs: AutocutJob[];
	defaults: AutocutJobOptions;
	supportedInputTypes: string[];
}

export interface AutocutApiErrorResponse {
	error: string;
}
