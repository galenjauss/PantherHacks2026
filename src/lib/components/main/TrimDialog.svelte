<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import ScissorsIcon from "@lucide/svelte/icons/scissors";
	import type { AutocutTranscriptWord } from "$lib/types/autocut";
	import type { EditorClipStripBeatBlock } from "$lib/stores/video-editor.svelte";

	const TRIM_STEP_MS = 100;

	interface TrimDialogTarget {
		slotId: string;
		variantId: string;
		takeLabel: string;
		humanLabel: string;
	}

	interface Props {
		open: boolean;
		target: TrimDialogTarget | null;
		blocks: EditorClipStripBeatBlock[];
		videoUrl?: string | null;
		transcriptWords?: AutocutTranscriptWord[];
		formatDuration: (ms: number) => string;
		onTrimVariant?: (
			slotId: string,
			variantId: string,
			field: "startOffsetMs" | "endOffsetMs",
			valueMs: number,
		) => void;
		onClearTrim?: (slotId: string, variantId: string) => void;
		onOpenChange: (open: boolean) => void;
	}

	let {
		open = $bindable(),
		target,
		blocks,
		videoUrl = null,
		transcriptWords = [],
		formatDuration,
		onTrimVariant,
		onClearTrim,
		onOpenChange,
	}: Props = $props();

	/* ── Derived trim state ── */

	let activeTrimDialogBlock = $derived(
		target?.slotId
			? (blocks.find((block) => block.beatId === target!.slotId) ?? null)
			: null,
	);
	let activeTrimDialogVariant = $derived(
		activeTrimDialogBlock && target?.variantId
			? (activeTrimDialogBlock.variants.find(
					(v) => v.variantId === target!.variantId,
				) ?? null)
			: null,
	);
	let activeTrim = $derived(
		activeTrimDialogVariant?.trimOffset ?? {
			startOffsetMs: 0,
			endOffsetMs: 0,
		},
	);
	let activeTrimHasTrim = $derived(
		activeTrim.startOffsetMs !== 0 || activeTrim.endOffsetMs !== 0,
	);
	let activeTrimStartMs = $derived(
		activeTrimDialogVariant?.trimmedStart ?? 0,
	);
	let activeTrimEndMs = $derived(activeTrimDialogVariant?.trimmedEnd ?? 0);
	let activeTrimOriginalStartMs = $derived(
		activeTrimDialogVariant?.start ?? 0,
	);
	let activeTrimOriginalDurationMs = $derived(
		activeTrimDialogVariant?.durationMs ?? 0,
	);
	let activeTrimOriginalEndMs = $derived(
		activeTrimOriginalStartMs + activeTrimOriginalDurationMs,
	);

	let trimTimelineStartMs = $derived(
		Math.max(
			0,
			activeTrimOriginalStartMs -
				Math.max(1500, Math.abs(activeTrim.startOffsetMs) + 800),
		),
	);
	let trimTimelineEndMs = $derived(
		Math.max(
			activeTrimOriginalEndMs +
				Math.max(1500, Math.abs(activeTrim.endOffsetMs) + 800),
			activeTrimEndMs + 500,
		),
	);
	let trimTimelineDurationMs = $derived(
		Math.max(trimTimelineEndMs - trimTimelineStartMs, TRIM_STEP_MS),
	);
	let trimStartPct = $derived(
		((activeTrimStartMs - trimTimelineStartMs) / trimTimelineDurationMs) *
			100,
	);
	let trimEndPct = $derived(
		((activeTrimEndMs - trimTimelineStartMs) / trimTimelineDurationMs) *
			100,
	);

	/* ── Preview playback ── */

	let trimPreviewCurrentTime = $state(0);
	let trimPreviewPaused = $state(true);
	let trimPreviewKey = $state("");

	function clampMs(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	function formatPreviewTimestamp(ms: number): string {
		const safeMs = Number.isFinite(ms) ? Math.max(ms, 0) : 0;
		const totalSeconds = Math.floor(safeMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const tenths = Math.floor((safeMs % 1000) / 100);
		return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
	}

	function snapTrimMs(value: number): number {
		return Math.round(value / TRIM_STEP_MS) * TRIM_STEP_MS;
	}

	function seekTrimPreview(nextMs: number, paused = true) {
		if (!activeTrimDialogVariant) return;
		trimPreviewCurrentTime =
			clampMs(nextMs, activeTrimStartMs, activeTrimEndMs) / 1000;
		trimPreviewPaused = paused;
	}

	function toggleTrimPreviewPlayback() {
		if (!activeTrimDialogVariant) return;
		if (trimPreviewPaused) {
			const resumeMs = trimPreviewCurrentTime * 1000;
			const nextMs =
				resumeMs >= activeTrimStartMs && resumeMs <= activeTrimEndMs
					? resumeMs
					: activeTrimStartMs;
			seekTrimPreview(nextMs, false);
			return;
		}
		trimPreviewPaused = true;
	}

	function timeToPct(ms: number): number {
		return ((ms - trimTimelineStartMs) / trimTimelineDurationMs) * 100;
	}

	/* ── Tick marks (adaptive density) ── */

	const TICK_TIERS: Array<{ minorMs: number; majorMs: number }> = [
		{ minorMs: 50, majorMs: 500 },
		{ minorMs: 100, majorMs: 1000 },
		{ minorMs: 250, majorMs: 1000 },
		{ minorMs: 500, majorMs: 2000 },
		{ minorMs: 1000, majorMs: 5000 },
		{ minorMs: 2000, majorMs: 10000 },
		{ minorMs: 5000, majorMs: 30000 },
	];

	const TARGET_MAX_LABELS = 8;

	let tickTier = $derived.by(() => {
		const dur = trimTimelineDurationMs;
		for (const tier of TICK_TIERS) {
			if (dur / tier.majorMs <= TARGET_MAX_LABELS) return tier;
		}
		return TICK_TIERS[TICK_TIERS.length - 1];
	});

	let trimTickMarks = $derived.by(() => {
		const { minorMs, majorMs } = tickTier;
		const firstTick =
			Math.ceil(trimTimelineStartMs / minorMs) * minorMs;
		const marks: Array<{
			id: string;
			leftPct: number;
			label: string;
			isMajor: boolean;
		}> = [];

		for (
			let timeMs = firstTick;
			timeMs <= trimTimelineEndMs;
			timeMs += minorMs
		) {
			const leftPct =
				((timeMs - trimTimelineStartMs) / trimTimelineDurationMs) * 100;
			const isMajor = timeMs % majorMs === 0;
			marks.push({
				id: `tick-${timeMs}`,
				leftPct,
				label: isMajor ? formatPreviewTimestamp(timeMs) : "",
				isMajor,
			});
		}

		return marks;
	});

	/* ── Word markers ── */

	let activeTrimWordMarkers = $derived.by(() => {
		if (!activeTrimDialogVariant) return [];
		const markers: Array<{
			id: string;
			text: string;
			leftPct: number;
			widthPct: number;
			startMs: number;
			endMs: number;
		}> = [];

		for (const [startIndex, endIndex] of activeTrimDialogVariant.wordRanges) {
			for (let index = startIndex; index <= endIndex; index += 1) {
				const word = transcriptWords[index];
				if (!word) continue;
				const startMs = clampMs(
					word.start,
					trimTimelineStartMs,
					trimTimelineEndMs,
				);
				const endMs = clampMs(word.end, startMs, trimTimelineEndMs);
				markers.push({
					id: `word-${index}`,
					text: word.text,
					leftPct: timeToPct(startMs),
					widthPct: Math.max(
						(Math.max(endMs - startMs, 40) / trimTimelineDurationMs) *
							100,
						0.5,
					),
					startMs,
					endMs,
				});
			}
		}

		return markers;
	});

	/* ── Trim handle drag ── */

	let trimHandleDrag = $state<"start" | "end" | null>(null);
	let trimBarEl = $state<HTMLDivElement | null>(null);
	let trimScrubbing = $state(false);

	function updateTrimFromClientX(clientX: number) {
		if (!trimHandleDrag || !trimBarEl || !target || !onTrimVariant) return;
		const rect = trimBarEl.getBoundingClientRect();
		if (rect.width <= 0) return;

		const ratio = clampMs((clientX - rect.left) / rect.width, 0, 1);
		const absoluteMs = snapTrimMs(
			trimTimelineStartMs + trimTimelineDurationMs * ratio,
		);

		if (trimHandleDrag === "start") {
			const clampedStart = Math.min(
				absoluteMs,
				activeTrimEndMs - TRIM_STEP_MS,
			);
			onTrimVariant(
				target.slotId,
				target.variantId,
				"startOffsetMs",
				clampedStart - activeTrimOriginalStartMs,
			);
			return;
		}

		const clampedEnd = Math.max(
			absoluteMs,
			activeTrimStartMs + TRIM_STEP_MS,
		);
		onTrimVariant(
			target.slotId,
			target.variantId,
			"endOffsetMs",
			clampedEnd - activeTrimOriginalEndMs,
		);
	}

	function seekTrimBarFromClientX(clientX: number) {
		if (!trimBarEl || !activeTrimDialogVariant) return;
		const rect = trimBarEl.getBoundingClientRect();
		if (rect.width <= 0) return;
		const ratio = clampMs((clientX - rect.left) / rect.width, 0, 1);
		const timeMs = trimTimelineStartMs + trimTimelineDurationMs * ratio;
		trimPreviewCurrentTime =
			clampMs(timeMs, trimTimelineStartMs, trimTimelineEndMs) / 1000;
		trimPreviewPaused = true;
	}

	function onTrimBarPointerDown(event: PointerEvent) {
		if (trimHandleDrag) return;
		event.preventDefault();
		trimScrubbing = true;
		seekTrimBarFromClientX(event.clientX);
	}

	function beginTrimHandleDrag(
		handle: "start" | "end",
		event: PointerEvent,
	) {
		event.preventDefault();
		event.stopPropagation();
		trimHandleDrag = handle;
		updateTrimFromClientX(event.clientX);
	}

	function onTrimBarPointerMove(event: PointerEvent) {
		if (trimHandleDrag) {
			updateTrimFromClientX(event.clientX);
		} else if (trimScrubbing) {
			seekTrimBarFromClientX(event.clientX);
		}
	}

	function endTrimHandleDrag() {
		trimHandleDrag = null;
		trimScrubbing = false;
	}

	/* ── Effects ── */

	$effect(() => {
		if (!open || !target || !activeTrimDialogVariant) {
			trimPreviewPaused = true;
			trimPreviewKey = "";
			return;
		}

		const nextKey = `${target.slotId}:${target.variantId}`;
		if (trimPreviewKey !== nextKey) {
			trimPreviewCurrentTime =
				activeTrimDialogVariant.trimmedStart / 1000;
			trimPreviewPaused = true;
			trimPreviewKey = nextKey;
		}
	});

	$effect(() => {
		if (!open || !activeTrimDialogVariant) return;

		const startSec = activeTrimDialogVariant.trimmedStart / 1000;
		const endSec = activeTrimDialogVariant.trimmedEnd / 1000;

		if (
			trimPreviewCurrentTime < startSec ||
			trimPreviewCurrentTime > endSec
		) {
			trimPreviewCurrentTime = startSec;
			return;
		}

		if (
			!trimPreviewPaused &&
			trimPreviewCurrentTime >= Math.max(endSec - 0.04, startSec)
		) {
			trimPreviewCurrentTime = startSec;
		}
	});

	$effect(() => {
		if (open && target && !activeTrimDialogVariant) {
			open = false;
			onOpenChange(false);
		}
	});
</script>

<svelte:window
	onpointermove={onTrimBarPointerMove}
	onpointerup={endTrimHandleDrag}
/>

{#if target && onTrimVariant}
	{@const t = target}
	<Dialog.Root bind:open onOpenChange={(v) => onOpenChange(v)}>
		<Dialog.Content
			class="gap-0 overflow-hidden border-border bg-popover p-0 sm:max-w-xl"
			style="min-width: 480px;"
			showCloseButton={false}
		>
			<!-- Header -->
			<Dialog.Header class="border-b border-border/60 px-6 pt-5 pb-4">
				<div class="flex items-center gap-2.5">
					<div class="flex size-8 items-center justify-center rounded-lg bg-primary/15">
						<ScissorsIcon class="size-4 text-primary" />
					</div>
					<div class="flex flex-col gap-0.5">
						<Dialog.Title class="text-base font-semibold tracking-tight text-foreground">
							Trim {t.humanLabel}
						</Dialog.Title>
						<Dialog.Description class="text-sm text-muted-foreground">
							{t.takeLabel} &mdash; drag either edge to adjust
						</Dialog.Description>
					</div>
				</div>
			</Dialog.Header>

			<!-- Body -->
			<div class="space-y-5 px-6 py-5">
				<!-- Video preview -->
				{#if videoUrl}
					<div
						class="overflow-hidden rounded-xl border border-border/80 bg-black shadow-lg"
					>
						<div class="relative">
							<video
								src={videoUrl}
								bind:currentTime={trimPreviewCurrentTime}
								bind:paused={trimPreviewPaused}
								class="aspect-video w-full bg-black object-contain"
								playsinline
								preload="auto"
								onloadedmetadata={() => {
									trimPreviewCurrentTime =
										activeTrimStartMs / 1000;
								}}
							>
								<track kind="captions" />
							</video>
							<button
								type="button"
								class="absolute inset-0 flex items-center justify-center bg-black/10 transition hover:bg-black/20"
								aria-label={trimPreviewPaused
									? "Play trimmed clip"
									: "Pause trimmed clip"}
								onclick={toggleTrimPreviewPlayback}
							>
								<span
									class="flex size-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-105"
								>
									{#if trimPreviewPaused}
										<PlayIcon class="ml-0.5 size-5" />
									{:else}
										<PauseIcon class="size-5" />
									{/if}
								</span>
							</button>
						</div>
					</div>
				{:else}
					<div
						class="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 text-center text-sm leading-5 text-muted-foreground"
					>
						Upload a source clip to preview trim changes here.
					</div>
				{/if}

				<!-- Trim bar section -->
				<div class="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4">
					<!-- Time ruler -->
					<div class="relative h-5 select-none">
						{#each trimTickMarks as tick (tick.id)}
							<div
								class="absolute bottom-0 -translate-x-1/2"
								style={`left:${tick.leftPct}%;`}
							>
								<div class="flex flex-col items-center">
									{#if tick.isMajor}
										<span class="mb-0.5 font-mono text-[9px] font-medium leading-none text-muted-foreground">
											{tick.label}
										</span>
										<div class="h-2.5 w-px bg-border"></div>
									{:else}
										<div class="h-1 w-px bg-border/50"></div>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					<!-- NLE-style trim bar -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						bind:this={trimBarEl}
						class="relative h-16 cursor-pointer touch-none select-none overflow-hidden rounded-lg border border-border/40 bg-muted/30"
						onpointerdown={onTrimBarPointerDown}
					>
						<!-- Active trimmed region -->
						<div
							class="absolute inset-y-0 border-y-2 border-primary/50 bg-primary/15"
							style={`left:${trimStartPct}%; width:${Math.max(trimEndPct - trimStartPct, 0)}%;`}
						></div>

						<!-- Dimmed overlay: before trim -->
						<div
							class="absolute inset-y-0 left-0 bg-black/50"
							style={`width:${trimStartPct}%;`}
						></div>
						<!-- Dimmed overlay: after trim -->
						<div
							class="absolute inset-y-0 bg-black/50"
							style={`left:${trimEndPct}%; right:0;`}
						></div>

						<!-- Word markers -->
						{#each activeTrimWordMarkers as marker (marker.id)}
							<div
								class="absolute bottom-0 z-10 -translate-x-1/2"
								style={`left:${marker.leftPct}%;`}
								title={`${marker.text} (${formatPreviewTimestamp(marker.startMs)})`}
							>
								<div class="h-3.5 w-px bg-primary/30"></div>
							</div>
						{/each}

						<!-- Left trim handle -->
						<div
							class="absolute inset-y-0 z-20 flex w-3 cursor-ew-resize items-center justify-center rounded-l-md bg-primary shadow-[2px_0_8px_rgba(0,0,0,0.3)] transition-colors hover:brightness-110"
							style={`left:${trimStartPct}%;`}
							role="slider"
							aria-label="Trim start"
							aria-valuemin={trimTimelineStartMs}
							aria-valuemax={activeTrimEndMs}
							aria-valuenow={activeTrimStartMs}
							tabindex="0"
							onpointerdown={(event) =>
								beginTrimHandleDrag("start", event)}
						>
							<div class="flex flex-col gap-[3px]">
								<div class="h-px w-[5px] rounded-full bg-white/70"></div>
								<div class="h-px w-[5px] rounded-full bg-white/70"></div>
								<div class="h-px w-[5px] rounded-full bg-white/70"></div>
							</div>
						</div>

						<!-- Right trim handle -->
						<div
							class="absolute inset-y-0 z-20 flex w-3 -translate-x-full cursor-ew-resize items-center justify-center rounded-r-md bg-primary shadow-[-2px_0_8px_rgba(0,0,0,0.3)] transition-colors hover:brightness-110"
							style={`left:${trimEndPct}%;`}
							role="slider"
							aria-label="Trim end"
							aria-valuemin={activeTrimStartMs}
							aria-valuemax={trimTimelineEndMs}
							aria-valuenow={activeTrimEndMs}
							tabindex="0"
							onpointerdown={(event) =>
								beginTrimHandleDrag("end", event)}
						>
							<div class="flex flex-col gap-[3px]">
								<div class="h-px w-[5px] rounded-full bg-white/70"></div>
								<div class="h-px w-[5px] rounded-full bg-white/70"></div>
								<div class="h-px w-[5px] rounded-full bg-white/70"></div>
							</div>
						</div>

						<!-- Playhead -->
						<div
							class="pointer-events-none absolute inset-y-0 z-30 w-px -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.4)]"
							style={`left:${timeToPct(trimPreviewCurrentTime * 1000)}%;`}
						>
							<div class="absolute -top-px left-1/2 -translate-x-1/2">
								<div class="size-2 rounded-full bg-white"></div>
							</div>
						</div>
					</div>

					<!-- Bottom timestamps -->
					<div class="flex items-center justify-between px-0.5 font-mono text-xs tabular-nums">
						<span class="font-medium text-foreground/70">{formatPreviewTimestamp(activeTrimStartMs)}</span>
						<span class="text-muted-foreground">{formatDuration(Math.max(activeTrimEndMs - activeTrimStartMs, 0))}</span>
						<span class="font-medium text-foreground/70">{formatPreviewTimestamp(activeTrimEndMs)}</span>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<Dialog.Footer class="flex-row items-center justify-between border-t border-border/60 px-6 py-4">
				<button
					type="button"
					disabled={!activeTrimHasTrim}
					class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
					onclick={() =>
						onClearTrim?.(t.slotId, t.variantId)}
				>
					<RotateCcwIcon class="size-3.5" />
					Reset
				</button>
				<Button
					size="sm"
					onclick={() => {
						open = false;
						onOpenChange(false);
					}}
					class="px-6 font-medium"
				>
					Done
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
