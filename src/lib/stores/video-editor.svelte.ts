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
	takeId?: string | null;
	beatId?: string | null;
}

interface SegmentMeta {
	label: string;
	shortLabel: string;
	color: string;
}

type WorkflowStepState = "done" | "active" | "pending";

export interface EditorCutSegment extends Omit<AutocutAnalysisSegment, "category"> {
	id: string;
	category: EditorCutCategory;
	durationMs: number;
	label: string;
	shortLabel: string;
	color: string;
}

interface AnalysisSegmentRef {
	id: string;
	index: number;
	segment: AutocutAnalysisSegment;
}

interface BeatVariantAggregate {
	beatId: string;
	takeId: string;
	refs: AnalysisSegmentRef[];
	goodRefs: AnalysisSegmentRef[];
	retakeRefs: AnalysisSegmentRef[];
}

interface EditorBeatVariant {
	id: string;
	beatId: string;
	takeId: string;
	label: string;
	kind: "good" | "retake";
	start: number;
	end: number;
	durationMs: number;
	previewText: string;
	fillerCount: number;
	refs: AnalysisSegmentRef[];
	playableRefs: AnalysisSegmentRef[];
}

interface EditorBeatGroup {
	beatId: string;
	start: number;
	end: number;
	variants: EditorBeatVariant[];
}

interface EditorClipStripBeatBlock {
	id: string;
	beatId: string;
	widthPct: number;
	activeLabel: string;
	variants: Array<
		Pick<EditorBeatVariant, "id" | "label" | "kind" | "durationMs" | "start"> & {
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

function buildPlaybackSegments(segments: AutocutAnalysisSegment[]): AutocutAnalysisSegment[] {
	const merged: AutocutAnalysisSegment[] = [];

	for (const segment of segments) {
		if (segment.category !== "good") continue;

		const last = merged[merged.length - 1];
		if (last && segment.start <= last.end + PREVIEW_EPSILON_MS) {
			last.end = Math.max(last.end, segment.end);
			last.text = [last.text, segment.text].filter(Boolean).join(" ").trim();
			last.takeId = last.takeId === segment.takeId ? last.takeId : null;
			continue;
		}

		merged.push({ ...segment });
	}

	return merged;
}

function buildAnalysisSegmentRefs(segments: AutocutAnalysisSegment[]): AnalysisSegmentRef[] {
	return segments.map((segment, index) => ({
		id: segmentId(index),
		index,
		segment
	}));
}

function variantBaseId(beatId: string, takeId: string): string {
	return `${beatId}::${takeId}`;
}

function humanizeId(id: string, prefix: string): string {
	const num = id.replace(new RegExp(`^${prefix}_`), "");
	return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${num}`;
}

function humanizeBeatId(beatId: string): string {
	return humanizeId(beatId, "beat");
}

function humanizeTakeId(takeId: string): string {
	return humanizeId(takeId, "take");
}

function variantPreviewText(refs: AnalysisSegmentRef[]): string {
	const text = refs
		.map((ref) => ref.segment.text.trim())
		.filter(Boolean)
		.join(" ");

	return text || "—";
}

function buildBeatGroups(refs: AnalysisSegmentRef[]): EditorBeatGroup[] {
	const groups = new Map<string, { beatId: string; variants: BeatVariantAggregate[] }>();

	for (const ref of refs) {
		const { beatId, takeId, category } = ref.segment;
		if (!beatId || !takeId || category === "dead_space") continue;

		const beatGroup = groups.get(beatId) ?? {
			beatId,
			variants: []
		};

		let aggregate = beatGroup.variants.find((item) => item.takeId === takeId);
		if (!aggregate) {
			aggregate = {
				beatId,
				takeId,
				refs: [],
				goodRefs: [],
				retakeRefs: []
			};
			beatGroup.variants.push(aggregate);
		}

		aggregate.refs.push(ref);
		if (category === "good") {
			aggregate.goodRefs.push(ref);
		} else if (category === "retake") {
			aggregate.retakeRefs.push(ref);
		}

		groups.set(beatId, beatGroup);
	}

	return [...groups.values()]
		.map((group) => {
			const variants = group.variants
				.flatMap((aggregate) => {
					const refsByTime = [...aggregate.refs].sort(
						(left, right) => left.segment.start - right.segment.start
					);
					const goodRefs = [...aggregate.goodRefs].sort(
						(left, right) => left.segment.start - right.segment.start
					);
					const retakeRefs = [...aggregate.retakeRefs].sort(
						(left, right) => left.segment.start - right.segment.start
					);

					const buildVariant = (
						kind: EditorBeatVariant["kind"],
						playableRefs: AnalysisSegmentRef[],
						label: string
					): EditorBeatVariant | null => {
						if (playableRefs.length === 0) return null;

						const start = playableRefs[0].segment.start;
						const end = playableRefs[playableRefs.length - 1].segment.end;
						const rangeRefs = refsByTime.filter(
							(ref) => ref.segment.start >= start && ref.segment.end <= end
						);

						return {
							id: `${variantBaseId(aggregate.beatId, aggregate.takeId)}::${kind}`,
							beatId: aggregate.beatId,
							takeId: aggregate.takeId,
							label,
							kind,
							start,
							end,
							durationMs: Math.max(end - start, 0),
							previewText: variantPreviewText(playableRefs),
							fillerCount: rangeRefs.filter(
								(ref) => ref.segment.category === "filler_words"
							).length,
							refs: rangeRefs,
							playableRefs
						};
					};

					const takeName = humanizeTakeId(aggregate.takeId);
					const builtVariants = [
						buildVariant(
							"good",
							goodRefs,
							retakeRefs.length > 0 ? takeName : takeName
						),
						buildVariant("retake", retakeRefs, `${takeName} (retake)`)
					].filter((variant): variant is EditorBeatVariant => Boolean(variant));

					return builtVariants;
				})
				.sort((left, right) => left.start - right.start);

			return {
				beatId: group.beatId,
				start: Math.min(...variants.map((variant) => variant.start)),
				end: Math.max(...variants.map((variant) => variant.end)),
				variants
			} satisfies EditorBeatGroup;
		})
		.filter((group) => group.variants.length > 0)
		.sort((left, right) => left.start - right.start);
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
	selectedBeatVariantIds = $state<Record<string, string>>({});
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
	private lastBeatSelectionSignature = "";
	private previewTimeUpdateHandler: (() => void) | null = null;
	private previewEndedHandler: (() => void) | null = null;
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

	get workflowSteps(): Array<{ label: string; state: WorkflowStepState; glyph: string }> {
		const steps = [
			"uploaded & validated format",
			this.transcribing && !this.transcriptId
				? "uploading clip for transcription"
				: this.pollingTranscript && this.normalizedTranscriptStatus === "queued"
					? "waiting for transcript generation"
					: this.transcriptWords.length > 0
						? "timestamped transcript ready"
						: "loading transcript timestamps",
			this.wordLabels.length > 0
				? "cuts ready from transcript analysis"
				: "coming up with cuts from the transcript",
			"syncing the autocut job",
			"clean preview ready"
		];

		return steps.map((label, index) => {
			const number = index + 1;
			const state =
				this.workflowStep > steps.length || number < this.workflowStep
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
		if (this.transcribing && !this.transcriptId) return "Uploading";
		if (this.pollingTranscript) {
			if (this.normalizedTranscriptStatus === "queued") return "Queued";
			return "Loading transcript";
		}
		if (this.analyzing) return "Finding cuts";
		if (this.isSyncing) return "Syncing cuts";
		if (this.isReady) return "Ready";
		return "Queued";
	}

	get statusDescription(): string {
		if (!this.selectedFile) return "Upload a video to begin the editor pipeline.";
		if (this.transcribing && !this.transcriptId) {
			return "Uploading the clip and starting the transcript job.";
		}
		if (this.pollingTranscript) {
			if (this.normalizedTranscriptStatus === "queued") {
				return "The transcript request is queued. Timestamped words will stream in once processing begins.";
			}

			return "Loading the transcript with word-level timestamps from AssemblyAI.";
		}
		if (this.analyzing) {
			return "Coming up with cuts by marking filler words, pauses, and retakes in the transcript.";
		}
		if (this.isSyncing) {
			return "Sending the latest transcript and cut plan to the autocut job.";
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

	get analysisSegmentRefs(): AnalysisSegmentRef[] {
		return buildAnalysisSegmentRefs(this.analysisSegments);
	}

	get beatGroups(): EditorBeatGroup[] {
		return buildBeatGroups(this.analysisSegmentRefs);
	}

	get swappableBeatGroups(): EditorBeatGroup[] {
		return this.beatGroups.filter((group) => group.variants.length > 1);
	}

	get swappableBeatCount(): number {
		return this.swappableBeatGroups.length;
	}

	get beatSelectionSignature(): string {
		return this.beatGroups
			.map((group) => `${group.beatId}:${group.variants.map((variant) => variant.id).join(",")}`)
			.join("|");
	}

	get composedSegmentRefs(): AnalysisSegmentRef[] {
		const refs = this.analysisSegmentRefs;
		const beatGroups = buildBeatGroups(refs);

		if (beatGroups.length === 0) {
			return refs;
		}

		const groupByBeatId = new Map(beatGroups.map((group) => [group.beatId, group]));
		const units: Array<{ sortStart: number; sortIndex: number; refs: AnalysisSegmentRef[] }> = [];

		for (const [sortIndex, group] of beatGroups.entries()) {
			const variant = this.selectedVariantForGroup(group);
			if (!variant) continue;

			units.push({
				sortStart: group.start,
				sortIndex,
				refs: [...variant.refs].sort(
					(left, right) => left.segment.start - right.segment.start
				)
			});
		}

		for (const ref of refs) {
			const beatId = ref.segment.beatId;
			if (beatId && groupByBeatId.has(beatId)) continue;

			units.push({
				sortStart: ref.segment.start,
				sortIndex: beatGroups.length + ref.index,
				refs: [ref]
			});
		}

		return units
			.sort(
				(left, right) =>
					left.sortStart - right.sortStart || left.sortIndex - right.sortIndex
			)
			.flatMap((unit) => unit.refs);
	}

	get baseComposedAnalysisSegments(): AutocutAnalysisSegment[] {
		const playableRefIds = new Set(
			this.beatGroups.flatMap(
				(group) => this.selectedVariantForGroup(group)?.playableRefs.map((ref) => ref.id) ?? []
			)
		);

		return this.composedSegmentRefs.map((ref) => {
			if (
				playableRefIds.has(ref.id) &&
				ref.segment.category === "retake"
			) {
				return {
					...ref.segment,
					category: "good" as const
				};
			}

			return ref.segment;
		});
	}

	get cutSegments(): EditorCutSegment[] {
		const composedRefs = this.composedSegmentRefs;
		const baseSegments = this.baseComposedAnalysisSegments;

		return baseSegments
			.map((segment, index) => {
				if (segment.category === "good") return null;

				const category = segment.category as EditorCutCategory;
				const meta = SEGMENT_META[category];
				return {
					...segment,
					id: composedRefs[index]?.id ?? segmentId(index),
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

		const swapText =
			this.swappableBeatCount > 0
				? `${this.swappableBeatCount} beat${this.swappableBeatCount === 1 ? " has" : "s have"} alternate takes available to swap. `
				: "";

		if (this.cutSegments.length === 0) {
			return (
				swapText ||
				"No removable filler, pauses, or retakes were detected in the current cut plan."
			);
		}

		const dominant = [...this.analysisStats].sort((a, b) => b.durationMs - a.durationMs)[0];
		return `${swapText}${dominant.label} is the largest cleanup opportunity right now. Current selections remove ${this.formatDuration(
			this.selectedCutDurationMs
		)} across ${this.selectedCutCount} segments and land at ${this.formatClock(this.cleanDurationMs)} clean runtime.`;
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
			selectedBeatVariantIds: this.beatGroups.map((group) => [
				group.beatId,
				this.selectedVariantForGroup(group)?.id ?? ""
			]),
			cutToggles: this.cutToggles,
			deadSpaceThreshold: this.deadSpaceThreshold,
			clipEndTrim: this.clipEndTrim
		});
	}

	get composedAnalysisSegments(): AutocutAnalysisSegment[] {
		const selected = new Set(this.selectedCutIds);
		const composedRefs = this.composedSegmentRefs;

		return this.baseComposedAnalysisSegments.map((segment, index) => {
			if (segment.category === "good") return segment;

			const id = composedRefs[index]?.id ?? segmentId(index);
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
		return buildPlaybackSegments(this.composedAnalysisSegments);
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
		return this.playbackSegments.reduce(
			(sum, segment) => sum + Math.max(segment.end - segment.start, 0),
			0
		);
	}

	get clipStripBeatBlocks(): EditorClipStripBeatBlock[] {
		const beatGroups = this.beatGroups;

		if (beatGroups.length === 0) return [];

		const blocks = beatGroups.map((group) => {
			const selectedVariant = this.selectedVariantForGroup(group);
			const maxDurationMs = Math.max(...group.variants.map((variant) => variant.durationMs), 1);
			const widthMs = Math.max(maxDurationMs, 600);

			return {
				id: group.beatId,
				beatId: group.beatId,
				activeLabel: selectedVariant?.label ?? "",
				widthMs,
				variants: group.variants.map((variant) => ({
					id: variant.id,
					label: variant.label,
					kind: variant.kind,
					durationMs: variant.durationMs,
					start: variant.start,
					isSelected: selectedVariant?.id === variant.id,
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
			colorMap.set(group.beatId, BEAT_COLORS[index % BEAT_COLORS.length]);
		}

		// Build ordered beat entries with their selected variants
		const beatEntries = beatGroups
			.map((group, groupIndex) => {
				const variant = this.selectedVariantForBeatId(group.beatId);
				if (!variant) return null;
				return { group, variant, groupIndex };
			})
			.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

		if (beatEntries.length === 0) return [];

		// Collect cut segments between beats
		const composedSegments = this.baseComposedAnalysisSegments;
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
					(seg) => seg.category !== "good" && seg.start >= gapStart && seg.end <= gapEnd
				);
				const cutDuration = cutsInGap.reduce((sum, seg) => sum + Math.max(seg.end - seg.start, 0), 0);

				if (cutDuration > 0) {
					const cutLabel = cutsInGap.length === 1
						? SEGMENT_META[cutsInGap[0].category as EditorCutCategory]?.shortLabel ?? "Cut"
						: `${cutsInGap.length} cuts`;

					blocks.push({
						id: `cut-before-${group.beatId}`,
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
						id: `gap-before-${group.beatId}`,
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
				id: `beat-${group.beatId}`,
				kind: "beat",
				beatId: group.beatId,
				label,
				humanLabel: humanizeBeatId(group.beatId),
				durationMs: variant.durationMs,
				widthPct: 0,
				color: colorMap.get(group.beatId) ?? BEAT_COLORS[0],
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
		const composedSegments = this.baseComposedAnalysisSegments;
		if (composedSegments.length === 0) return [];

		const beatGroups = this.beatGroups;
		const colorMap = new Map<string, string>();
		for (const [index, group] of beatGroups.entries()) {
			colorMap.set(group.beatId, BEAT_COLORS[index % BEAT_COLORS.length]);
		}

		const blocks: EditedTimelineBlock[] = [];
		let totalMs = 0;

		for (const [index, seg] of composedSegments.entries()) {
			const durationMs = Math.max(seg.end - seg.start, 0);
			if (durationMs <= 0) continue;

			const isGood = seg.category === "good";
			const beatId = seg.beatId ?? null;

			blocks.push({
				id: `before-${index}`,
				kind: isGood ? "beat" : "cut",
				beatId,
				label: isGood
					? (beatId ? humanizeBeatId(beatId) : "Keep")
					: (SEGMENT_META[seg.category as EditorCutCategory]?.shortLabel ?? seg.category),
				humanLabel: isGood
					? (beatId ? humanizeBeatId(beatId) : "")
					: "",
				durationMs,
				widthPct: 0,
				color: isGood
					? (beatId ? (colorMap.get(beatId) ?? BEAT_COLORS[0]) : "#22c55e")
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

	selectedVariantForBeatId(beatId: string): EditorBeatVariant | undefined {
		const group = this.beatGroups.find((g) => g.beatId === beatId);
		if (!group) return undefined;
		return this.selectedVariantForGroup(group);
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
		const selectedId = this.selectedBeatVariantIds[group.beatId];

		return group.variants.find((variant) => variant.id === selectedId) ?? group.variants[0];
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
		this.selectedBeatVariantIds = {};
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
		this.lastBeatSelectionSignature = "";
	}

	syncSelectionWithSegments(signature: string) {
		if (signature === this.lastSelectionSignature) return;

		this.lastSelectionSignature = signature;
		this.selectedCutIds = this.cutSegments.map((segment) => segment.id);
	}

	syncBeatSelections(signature: string) {
		if (signature === this.lastBeatSelectionSignature) return;

		this.lastBeatSelectionSignature = signature;
		const nextSelections: Record<string, string> = {};

		for (const group of this.beatGroups) {
			const existing = this.selectedBeatVariantIds[group.beatId];
			nextSelections[group.beatId] = group.variants.some((variant) => variant.id === existing)
				? existing
				: group.variants[0]?.id ?? "";
		}

		this.selectedBeatVariantIds = nextSelections;
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

	selectBeatVariant(beatId: string, id: string) {
		if (this.selectedBeatVariantIds[beatId] === id) return;

		this.stopPreview();
		this.selectedBeatVariantIds = {
			...this.selectedBeatVariantIds,
			[beatId]: id
		};
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
		this.selectedBeatVariantIds = {};
		this.lastBeatSelectionSignature = "";

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
