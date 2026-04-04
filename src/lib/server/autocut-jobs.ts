import {
	DEFAULT_AUTOCUT_JOB_OPTIONS,
	type AutocutEditDecision,
	type AutocutEditPlan,
	type AutocutJob,
	type AutocutJobOptions,
	type AutocutJobStage,
	type AutocutRenderOutput,
	type AutocutSource,
	type AutocutTranscript,
	type AutocutTranscriptSegment
} from "$lib/types/autocut";

interface CreateAutocutJobInput {
	source: AutocutSource;
	options: AutocutJobOptions;
	metadata: Record<string, string>;
	language: string;
	speakersExpected: number | null;
}

interface AutocutJobRecord extends CreateAutocutJobInput {
	id: string;
	createdAtMs: number;
}

const jobs = new Map<string, AutocutJobRecord>();

const DEFAULT_DURATION_MS = 42_000;
const NEXT_POLL_AFTER_MS = 1_500;

const STAGE_SCHEDULE_MS = {
	queued: 1_000,
	transcription: 4_000,
	planning: 3_000,
	rendering: 3_500
} as const;

const OUTPUT_MIME_TYPES: Record<AutocutJobOptions["outputFormat"], string> = {
	mp4: "video/mp4",
	mov: "video/quicktime"
};

const TRANSCRIPT_TEMPLATE = [
	{
		startRatio: 0,
		endRatio: 0.11,
		text: "Today I want to show the fastest way to turn a long recording into a clean highlight.",
		confidence: 0.99
	},
	{
		startRatio: 0.13,
		endRatio: 0.27,
		text: "First we upload the source file, transcribe it, and map every sentence to a timestamp.",
		confidence: 0.98
	},
	{
		startRatio: 0.29,
		endRatio: 0.45,
		text: "Then the planning model tags the hook, the explanation, and the moments worth keeping.",
		confidence: 0.96
	},
	{
		startRatio: 0.49,
		endRatio: 0.58,
		text: "Actually let me restart that line because I rushed through the most important part.",
		confidence: 0.92
	},
	{
		startRatio: 0.6,
		endRatio: 0.77,
		text: "The final render removes the dead air, keeps the strongest beats, and shortens the clip.",
		confidence: 0.97
	},
	{
		startRatio: 0.8,
		endRatio: 0.97,
		text: "That leaves us with a polished version that is ready to publish or hand off for review.",
		confidence: 0.98
	}
] as const;

const DECISION_TEMPLATE = [
	{
		startRatio: 0,
		endRatio: 0.11,
		action: "keep",
		category: "hook",
		label: "Open with the payoff",
		reason: "Strong opening sentence that tells the viewer what the clip delivers."
	},
	{
		startRatio: 0.11,
		endRatio: 0.13,
		action: "cut",
		category: "silence",
		label: "Trim dead air",
		reason: "Short pause between the hook and setup."
	},
	{
		startRatio: 0.13,
		endRatio: 0.45,
		action: "keep",
		category: "context",
		label: "Keep setup and explanation",
		reason: "Explains the workflow clearly without repeating the hook."
	},
	{
		startRatio: 0.45,
		endRatio: 0.6,
		action: "cut",
		category: "retake",
		label: "Remove retake section",
		reason: "Contains a restart and hesitation that weakens pacing."
	},
	{
		startRatio: 0.6,
		endRatio: 0.77,
		action: "keep",
		category: "demo",
		label: "Keep the product payoff",
		reason: "Explains the value of the automated cut."
	},
	{
		startRatio: 0.77,
		endRatio: 0.8,
		action: "trim",
		category: "silence",
		label: "Tighten transition",
		reason: "Minor trim to smooth the handoff to the closing line."
	},
	{
		startRatio: 0.8,
		endRatio: 0.97,
		action: "keep",
		category: "cta",
		label: "Keep the closing summary",
		reason: "Useful final line that lands the outcome."
	}
] as const satisfies ReadonlyArray<
	Omit<AutocutEditDecision, "id" | "startMs" | "endMs"> & {
		startRatio: number;
		endRatio: number;
	}
>;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function toIsoString(timestampMs: number): string {
	return new Date(timestampMs).toISOString();
}

function scaleMs(ratio: number, durationMs: number): number {
	return Math.round(ratio * durationMs);
}

function buildTranscript(
	jobId: string,
	source: AutocutSource,
	language: string,
	speakersExpected: number | null,
	createdAtMs: number
): AutocutTranscript {
	const speakerCount = clamp(speakersExpected ?? 1, 1, 2);
	const segments: AutocutTranscriptSegment[] = TRANSCRIPT_TEMPLATE.map((template, index) => ({
		id: `${jobId}-segment-${index + 1}`,
		speaker: `Speaker ${(index % speakerCount) + 1}`,
		startMs: scaleMs(template.startRatio, source.durationMs),
		endMs: scaleMs(template.endRatio, source.durationMs),
		text: template.text,
		confidence: template.confidence
	}));

	return {
		language,
		durationMs: source.durationMs,
		generatedAt: toIsoString(
			createdAtMs + STAGE_SCHEDULE_MS.queued + STAGE_SCHEDULE_MS.transcription
		),
		segments
	};
}

function buildEditPlan(
	jobId: string,
	source: AutocutSource,
	createdAtMs: number
): AutocutEditPlan {
	const decisions: AutocutEditDecision[] = DECISION_TEMPLATE.map((template, index) => ({
		id: `${jobId}-decision-${index + 1}`,
		action: template.action,
		category: template.category,
		label: template.label,
		reason: template.reason,
		startMs: scaleMs(template.startRatio, source.durationMs),
		endMs: scaleMs(template.endRatio, source.durationMs)
	}));

	const estimatedOutputDurationMs = decisions
		.filter((decision) => decision.action !== "cut")
		.reduce((total, decision) => total + (decision.endMs - decision.startMs), 0);

	return {
		generatedAt: toIsoString(
			createdAtMs +
				STAGE_SCHEDULE_MS.queued +
				STAGE_SCHEDULE_MS.transcription +
				STAGE_SCHEDULE_MS.planning
		),
		summary:
			"Keep the opening promise and the clear explanation, remove the retake and dead air, then close on the outcome.",
		estimatedOutputDurationMs,
		decisions
	};
}

function buildRenderOutput(
	jobId: string,
	source: AutocutSource,
	editPlan: AutocutEditPlan,
	options: AutocutJobOptions
): AutocutRenderOutput {
	return {
		fileName: `${source.fileName.replace(/\.[^.]+$/, "") || "autocut-output"}-autocut.${options.outputFormat}`,
		mimeType: OUTPUT_MIME_TYPES[options.outputFormat],
		durationMs: editPlan.estimatedOutputDurationMs,
		playbackUrl: null,
		downloadUrl: null,
		status: "placeholder",
		notes: [
			"Render output is not wired to ffmpeg yet.",
			"Use the planning stage decisions as the current source of truth for the timeline UI.",
			`Job ${jobId} is returning placeholder render metadata for frontend integration.`
		]
	};
}

function buildStage<TOutput>(
	nowMs: number,
	startMs: number,
	endMs: number,
	output: TOutput | null
): AutocutJobStage<TOutput> {
	if (nowMs < startMs) {
		return {
			status: "pending",
			progress: 0,
			startedAt: null,
			completedAt: null,
			output: null,
			error: null
		};
	}

	if (nowMs >= endMs) {
		return {
			status: "completed",
			progress: 100,
			startedAt: toIsoString(startMs),
			completedAt: toIsoString(endMs),
			output,
			error: null
		};
	}

	const progress = clamp(Math.round(((nowMs - startMs) / (endMs - startMs)) * 100), 1, 99);

	return {
		status: "processing",
		progress,
		startedAt: toIsoString(startMs),
		completedAt: null,
		output: null,
		error: null
	};
}

function buildSnapshot(record: AutocutJobRecord, nowMs = Date.now()): AutocutJob {
	const queueEndMs = record.createdAtMs + STAGE_SCHEDULE_MS.queued;
	const transcriptionEndMs = queueEndMs + STAGE_SCHEDULE_MS.transcription;
	const planningEndMs = transcriptionEndMs + STAGE_SCHEDULE_MS.planning;
	const renderEndMs = planningEndMs + STAGE_SCHEDULE_MS.rendering;

	const transcript = buildTranscript(
		record.id,
		record.source,
		record.language,
		record.speakersExpected,
		record.createdAtMs
	);
	const editPlan = buildEditPlan(record.id, record.source, record.createdAtMs);
	const renderOutput = buildRenderOutput(record.id, record.source, editPlan, record.options);

	const transcriptionStage = buildStage(nowMs, queueEndMs, transcriptionEndMs, transcript);
	const planningStage = buildStage(nowMs, transcriptionEndMs, planningEndMs, editPlan);
	const renderingStage = record.options.renderOutput
		? buildStage(nowMs, planningEndMs, renderEndMs, renderOutput)
		: {
				status: "completed",
				progress: 100,
				startedAt: toIsoString(planningEndMs),
				completedAt: toIsoString(planningEndMs),
				output: null,
				error: null
			} satisfies AutocutJobStage<AutocutRenderOutput>;

	const overallEndMs = record.options.renderOutput ? renderEndMs : planningEndMs;

	let status: AutocutJob["status"] = "completed";
	let currentStep = "Auto-cut complete";

	if (nowMs < queueEndMs) {
		status = "queued";
		currentStep = "Queued for transcription";
	} else if (nowMs < transcriptionEndMs) {
		status = "transcribing";
		currentStep = "Generating timestamped transcript";
	} else if (nowMs < planningEndMs) {
		status = "planning";
		currentStep = "Building AI cut plan";
	} else if (record.options.renderOutput && nowMs < renderEndMs) {
		status = "rendering";
		currentStep = "Preparing cleaned video output";
	}

	const progress = clamp(
		Math.round(((Math.min(nowMs, overallEndMs) - record.createdAtMs) / (overallEndMs - record.createdAtMs)) * 100),
		0,
		100
	);

	return {
		id: record.id,
		status,
		progress,
		currentStep,
		nextPollAfterMs: status === "completed" ? 0 : NEXT_POLL_AFTER_MS,
		createdAt: toIsoString(record.createdAtMs),
		updatedAt: toIsoString(Math.min(nowMs, overallEndMs)),
		language: record.language,
		speakersExpected: record.speakersExpected,
		source: record.source,
		options: record.options,
		metadata: record.metadata,
		stages: {
			transcription: transcriptionStage,
			planning: planningStage,
			rendering: renderingStage
		}
	};
}

export function createAutocutJob(input: CreateAutocutJobInput): AutocutJob {
	const record: AutocutJobRecord = {
		id: crypto.randomUUID(),
		createdAtMs: Date.now(),
		source: {
			...input.source,
			durationMs: input.source.durationMs || DEFAULT_DURATION_MS
		},
		options: {
			...DEFAULT_AUTOCUT_JOB_OPTIONS,
			...input.options
		},
		metadata: input.metadata,
		language: input.language,
		speakersExpected: input.speakersExpected
	};

	jobs.set(record.id, record);

	return buildSnapshot(record, record.createdAtMs);
}

export function getAutocutJob(jobId: string): AutocutJob | null {
	const record = jobs.get(jobId);

	if (!record) {
		return null;
	}

	return buildSnapshot(record);
}

export function listAutocutJobs(): AutocutJob[] {
	return [...jobs.values()]
		.sort((left, right) => right.createdAtMs - left.createdAtMs)
		.map((record) => buildSnapshot(record));
}
