import { browser } from "$app/environment";

import type {
	AutocutAnalysisSegment,
	AutocutJob,
	AutocutJobResponse,
	AutocutTranscriptWord,
	CreateAutocutJobRequest
} from "$lib/types/autocut";
import {
	buildAnalysisSegments,
	DEFAULT_ANALYSIS_SEGMENT_OPTIONS
} from "$lib/video/analysis-segments";

export type EditorCutCategory = "filler_words" | "dead_space" | "retake";
export type EditorFilter = "all" | EditorCutCategory;

type WordLabelCategory = "good" | "filler_words" | "retake";

interface WordLabel {
	index: number;
	category: WordLabelCategory;
}

interface SegmentMeta {
	label: string;
	shortLabel: string;
	color: string;
}

export interface EditorCutSegment extends Omit<AutocutAnalysisSegment, "category"> {
	id: string;
	category: EditorCutCategory;
	durationMs: number;
	label: string;
	shortLabel: string;
	color: string;
}

const SEGMENT_META: Record<EditorCutCategory, SegmentMeta> = {
	filler_words: {
		label: "Filler words",
		shortLabel: "Filler",
		color: "#f97316"
	},
	dead_space: {
		label: "Dead pauses",
		shortLabel: "Pause",
		color: "#3b82f6"
	},
	retake: {
		label: "Retakes",
		shortLabel: "Retake",
		color: "#22c55e"
	}
};

const CLIP_STRIP_LABEL_LIMIT = 12;
const TIMELINE_BAR_COUNT = 96;
const TIMELINE_LABEL_COUNT = 8;
const PREVIEW_EPSILON_MS = 4;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function segmentId(segment: AutocutAnalysisSegment, index: number): string {
	return `${segment.category}:${segment.start}:${segment.end}:${index}`;
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

function buildPlaybackSegments(segments: AutocutAnalysisSegment[]): AutocutAnalysisSegment[] {
	const merged: AutocutAnalysisSegment[] = [];

	for (const segment of segments) {
		if (segment.category !== "good") continue;

		const last = merged[merged.length - 1];
		if (last && segment.start <= last.end + PREVIEW_EPSILON_MS) {
			last.end = Math.max(last.end, segment.end);
			last.text = [last.text, segment.text].filter(Boolean).join(" ").trim();
			continue;
		}

		merged.push({ ...segment });
	}

	return merged;
}

class VideoEditorState {
	selectedFile = $state<File | null>(null);
	videoUrl = $state<string | null>(null);
	videoDurationMs = $state<number | null>(null);
	currentTimeMs = $state(0);
	previewMode = $state<"before" | "after">("after");
	isPreviewPlaying = $state(false);
	currentPreviewSegmentIndex = $state(0);
	activeFilter = $state<EditorFilter>("all");
	selectedCutIds = $state<string[]>([]);
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
	wordLabels = $state<WordLabel[]>([]);
	transcriptError = $state("");
	analysisError = $state("");
	jobError = $state("");
	job = $state<AutocutJob | null>(null);

	private currentRun = 0;
	private transcriptPollDelay: ReturnType<typeof setTimeout> | null = null;
	private activeJobSyncToken = 0;
	private lastSyncSignature = "";
	private lastSelectionSignature = "";
	private previewTimeUpdateHandler: (() => void) | null = null;
	private previewEndedHandler: (() => void) | null = null;
	private videoElement: HTMLVideoElement | null = null;

	get totalDurationMs(): number {
		return this.videoDurationMs ?? this.transcriptWords[this.transcriptWords.length - 1]?.end ?? 0;
	}

	get isBusy(): boolean {
		return this.transcribing || this.pollingTranscript || this.analyzing || this.creatingAutocutJob;
	}

	get hasErrors(): boolean {
		return Boolean(this.transcriptError || this.analysisError || this.jobError);
	}

	get isReady(): boolean {
		return Boolean(this.selectedFile && this.wordLabels.length > 0 && !this.isBusy && !this.hasErrors);
	}

	get statusLabel(): string {
		if (!this.selectedFile) return "Awaiting upload";
		if (this.transcribing || this.pollingTranscript) return "Transcribing";
		if (this.analyzing) return "Analyzing";
		if (this.creatingAutocutJob) return "Syncing";
		if (this.isReady) return "Ready";
		return "Queued";
	}

	get statusDescription(): string {
		if (!this.selectedFile) return "Upload a video to begin the editor pipeline.";
		if (this.transcribing || this.pollingTranscript) {
			return "AssemblyAI is generating the timestamped transcript.";
		}
		if (this.analyzing) {
			return "Classifying filler words, pauses, and retakes.";
		}
		if (this.creatingAutocutJob) {
			return "Syncing the latest cut plan to the autocut job.";
		}
		if (this.isReady) {
			return "Preview the applied cuts, inspect the transcript, and refine the plan.";
		}
		return "The upload is queued for processing.";
	}

	get workflowStep(): number {
		if (!this.selectedFile) return 0;
		if (this.isReady) return 5;
		if (this.transcribing || this.pollingTranscript) return 2;
		if (this.analyzing || this.transcriptWords.length > 0) return 3;
		if (this.creatingAutocutJob || this.job) return 4;
		return 1;
	}

	get analysisSegments(): AutocutAnalysisSegment[] {
		if (this.transcriptWords.length === 0 || this.wordLabels.length === 0) {
			return [];
		}

		return buildAnalysisSegments(this.transcriptWords, this.wordLabels, {
			deadSpaceThresholdMs: this.deadSpaceThreshold,
			clipEndTrimMs: this.clipEndTrim
		});
	}

	get cutSegments(): EditorCutSegment[] {
		return this.analysisSegments
			.map((segment, index) => {
				if (segment.category === "good") return null;

				const category = segment.category as EditorCutCategory;
				const meta = SEGMENT_META[category];
				return {
					...segment,
					id: segmentId(segment, index),
					category,
					durationMs: Math.max(segment.end - segment.start, 0),
					label: humanizeSegmentText(segment),
					shortLabel: meta.shortLabel,
					color: meta.color
				} satisfies EditorCutSegment;
			})
			.filter((segment): segment is EditorCutSegment => Boolean(segment));
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

		if (this.cutSegments.length === 0) {
			return "No removable filler, pauses, or retakes were detected in the current cut plan.";
		}

		const dominant = [...this.analysisStats].sort((a, b) => b.durationMs - a.durationMs)[0];
		return `${dominant.label} is the largest cleanup opportunity right now. Current selections remove ${this.formatDuration(
			this.selectedCutDurationMs
		)} across ${this.selectedCutCount} segments.`;
	}

	get selectionSignature(): string {
		return this.cutSegments.map((segment) => segment.id).join("|");
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
			cutToggles: this.cutToggles,
			deadSpaceThreshold: this.deadSpaceThreshold,
			clipEndTrim: this.clipEndTrim
		});
	}

	get syncedAnalysisSegments(): AutocutAnalysisSegment[] {
		const selected = new Set(this.selectedCutIds);

		return this.analysisSegments.map((segment, index) => {
			if (segment.category === "good") return segment;

			const id = segmentId(segment, index);
			if (this.cutToggles[segment.category] && selected.has(id)) {
				return segment;
			}

			return {
				...segment,
				category: "good"
			};
		});
	}

	get playbackSegments(): AutocutAnalysisSegment[] {
		return buildPlaybackSegments(this.syncedAnalysisSegments);
	}

	get selectedCutCount(): number {
		const selected = new Set(this.selectedCutIds);

		return this.cutSegments.filter(
			(segment) => this.cutToggles[segment.category] && selected.has(segment.id)
		).length;
	}

	get selectedCutDurationMs(): number {
		const selected = new Set(this.selectedCutIds);

		return this.cutSegments
			.filter((segment) => this.cutToggles[segment.category] && selected.has(segment.id))
			.reduce((sum, segment) => sum + segment.durationMs, 0);
	}

	get cleanDurationMs(): number {
		return Math.max(this.totalDurationMs - this.selectedCutDurationMs, 0);
	}

	get clipStripSegments() {
		const totalDurationMs = this.totalDurationMs;

		if (totalDurationMs <= 0) return [];

		const selected = new Set(this.selectedCutIds);

		return this.analysisSegments.map((segment, index) => {
			const isCut =
				segment.category !== "good" &&
				this.cutToggles[segment.category] &&
				selected.has(segmentId(segment, index));
			const widthPct = Math.max(((segment.end - segment.start) / totalDurationMs) * 100, 0.5);

			return {
				id: segmentId(segment, index),
				type: isCut ? segment.category : "good",
				widthPct,
				label: isCut ? clipStripLabel(segment) : null
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

	updateCurrentTime(currentTimeSeconds: number) {
		this.currentTimeMs = Math.max(Math.round(currentTimeSeconds * 1000), 0);
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
		this.currentTimeMs = 0;
		this.previewMode = "after";
		this.activeFilter = "all";
		this.selectedCutIds = [];
		this.transcribing = false;
		this.pollingTranscript = false;
		this.analyzing = false;
		this.creatingAutocutJob = false;
		this.transcriptId = "";
		this.transcriptStatus = "";
		this.transcriptText = "";
		this.transcriptWords = [];
		this.wordLabels = [];
		this.transcriptError = "";
		this.analysisError = "";
		this.jobError = "";
		this.job = null;
		this.cutToggles = {
			filler_words: true,
			dead_space: true,
			retake: true
		};
	}

	syncSelectionWithSegments(signature: string) {
		if (!signature || signature === this.lastSelectionSignature) return;

		this.lastSelectionSignature = signature;
		this.selectedCutIds = this.cutSegments.map((segment) => segment.id);
	}

	toggleCutSelection(id: string) {
		if (this.selectedCutIds.includes(id)) {
			this.selectedCutIds = this.selectedCutIds.filter((value) => value !== id);
			return;
		}

		this.selectedCutIds = [...this.selectedCutIds, id];
	}

	selectAllCuts() {
		this.selectedCutIds = this.cutSegments.map((segment) => segment.id);
	}

	clearSelectedCuts() {
		this.selectedCutIds = [];
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
				analysisSegments: this.syncedAnalysisSegments
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
		if (this.videoElement && this.previewTimeUpdateHandler) {
			this.videoElement.removeEventListener("timeupdate", this.previewTimeUpdateHandler);
		}

		if (this.videoElement && this.previewEndedHandler) {
			this.videoElement.removeEventListener("ended", this.previewEndedHandler);
		}

		this.previewTimeUpdateHandler = null;
		this.previewEndedHandler = null;
	}

	private async playSegment(index: number, segments: AutocutAnalysisSegment[]) {
		if (!this.videoElement) return;

		if (index >= segments.length) {
			this.stopPreview();
			return;
		}

		this.currentPreviewSegmentIndex = index;
		const segment = segments[index];
		this.videoElement.currentTime = segment.start / 1000;

		const onTimeUpdate = () => {
			if (!this.videoElement) return;

			if (this.videoElement.currentTime * 1000 >= segment.end) {
				this.clearPreviewListeners();
				this.videoElement.pause();
				void this.playSegment(index + 1, segments);
			}
		};

		this.previewTimeUpdateHandler = onTimeUpdate;
		this.videoElement.addEventListener("timeupdate", onTimeUpdate);
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

		try {
			const formData = new FormData();
			formData.append("file", this.selectedFile);

			const res = await fetch("/api/video/transcribe", {
				method: "POST",
				body: formData
			});

			const data = await res.json();

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

		try {
			const res = await fetch("/api/video/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					words: this.transcriptWords,
					options: {
						deadSpaceThresholdMs: this.deadSpaceThreshold,
						clipEndTrimMs: this.clipEndTrim
					}
				})
			});

			const data = await res.json();

			if (runId !== this.currentRun) return;

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
