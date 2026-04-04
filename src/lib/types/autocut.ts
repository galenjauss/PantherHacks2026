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
}

export interface AutocutSource {
	fileName: string;
	mimeType: string;
	sizeBytes: number | null;
	durationMs: number;
	sourceUrl: string | null;
}

export interface AutocutTranscriptSegment {
	id: string;
	speaker: string;
	startMs: number;
	endMs: number;
	text: string;
	confidence: number;
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
