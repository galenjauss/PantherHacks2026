<script lang="ts">
	import {
		HoverCard,
		HoverCardContent,
		HoverCardTrigger,
	} from "$lib/components/ui/hover-card";
	import { cn } from "$lib/utils.js";
	import type { AutocutTranscriptWord } from "$lib/types/autocut";
	import type { EditorClipStripBeatBlock } from "$lib/stores/video-editor.svelte";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	interface Props {
		blocks: EditorClipStripBeatBlock[];
		currentTimeMs: number;
		formatDuration: (ms: number) => string;
		videoUrl?: string | null;
		transcriptWords?: AutocutTranscriptWord[];
		onSlotHover?: (beatId: string | null) => void;
		onSelectVariant: (
			slotId: string,
			variantId: string,
			startMs: number,
		) => void;
		onTrimVariant?: (
			slotId: string,
			variantId: string,
			field: "startOffsetMs" | "endOffsetMs",
			valueMs: number,
		) => void;
		onClearTrim?: (slotId: string, variantId: string) => void;
	}

	let {
		blocks,
		currentTimeMs,
		formatDuration,
		videoUrl = null,
		transcriptWords = [],
		onSlotHover,
		onSelectVariant,
		onTrimVariant,
		onClearTrim,
	}: Props = $props();

	const TRIM_STEP_MS = 100;
	const PAN_GUTTER_PX = 240;

	let trimDialogOpen = $state(false);
	let trimPreviewCurrentTime = $state(0);
	let trimPreviewPaused = $state(true);
	let trimPreviewKey = $state("");

	interface TrimDialogTarget {
		slotId: string;
		variantId: string;
		takeLabel: string;
		humanLabel: string;
	}

	let trimDialogTarget = $state<TrimDialogTarget | null>(null);
	let activeTrimDialogSlotId = $derived(trimDialogTarget?.slotId ?? "");
	let activeTrimDialogVariantId = $derived(trimDialogTarget?.variantId ?? "");

	let activeTrimDialogBlock = $derived(
		activeTrimDialogSlotId
			? (blocks.find(
					(block) => block.beatId === activeTrimDialogSlotId,
				) ?? null)
			: null,
	);
	let activeTrimDialogVariant = $derived(
		activeTrimDialogBlock && activeTrimDialogVariantId
			? (activeTrimDialogBlock.variants.find(
					(variant) =>
						variant.variantId === activeTrimDialogVariantId,
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

	let trimHandleDrag = $state<"start" | "end" | null>(null);
	let trimBarEl = $state<HTMLDivElement | null>(null);

	function openTrimDialog(
		slotId: string,
		variantId: string,
		takeLabel: string,
		humanLabel: string,
	) {
		trimDialogTarget = { slotId, variantId, takeLabel, humanLabel };
		trimDialogOpen = true;
	}

	function formatOffset(ms: number): string {
		return `${ms >= 0 ? "+" : ""}${(ms / 1000).toFixed(1)}s`;
	}

	function formatPreviewTimestamp(ms: number): string {
		const safeMs = Number.isFinite(ms) ? Math.max(ms, 0) : 0;
		const totalSeconds = Math.floor(safeMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const tenths = Math.floor((safeMs % 1000) / 100);
		return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
	}

	function clampMs(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	function slotScriptText(block: EditorClipStripBeatBlock): string {
		const selected = block.variants.find((variant) => variant.isSelected);
		return (
			selected?.previewText ?? block.variants[0]?.previewText ?? ""
		).trim();
	}

	function primaryVariantForBlock(block: EditorClipStripBeatBlock) {
		return (
			block.variants.find((variant) => variant.isSelected) ??
			block.variants[0] ??
			null
		);
	}

	function snapTrimMs(value: number): number {
		return Math.round(value / TRIM_STEP_MS) * TRIM_STEP_MS;
	}

	function seekTrimPreview(nextMs: number, paused = true) {
		const lower = activeTrimStartMs;
		const upper = activeTrimEndMs;
		if (!activeTrimDialogVariant) return;

		trimPreviewCurrentTime = clampMs(nextMs, lower, upper) / 1000;
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

	const TICK_INTERVAL_MS = 50;

	let trimTickMarks = $derived.by(() => {
		const firstTick = Math.ceil(trimTimelineStartMs / TICK_INTERVAL_MS) * TICK_INTERVAL_MS;
		const marks: Array<{ id: string; leftPct: number; label: string; isMajor: boolean }> = [];

		for (let timeMs = firstTick; timeMs <= trimTimelineEndMs; timeMs += TICK_INTERVAL_MS) {
			const leftPct = ((timeMs - trimTimelineStartMs) / trimTimelineDurationMs) * 100;
			const isMajor = timeMs % 500 === 0;
			marks.push({
				id: `tick-${timeMs}`,
				leftPct,
				label: isMajor ? formatPreviewTimestamp(timeMs) : "",
				isMajor,
			});
		}

		return marks;
	});

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

	function updateTrimFromClientX(clientX: number) {
		if (!trimHandleDrag || !trimBarEl || !trimDialogTarget || !onTrimVariant) {
			return;
		}

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
				trimDialogTarget.slotId,
				trimDialogTarget.variantId,
				"startOffsetMs",
				clampedStart - activeTrimOriginalStartMs,
			);
			return;
		}

		const clampedEnd = Math.max(absoluteMs, activeTrimStartMs + TRIM_STEP_MS);
		onTrimVariant(
			trimDialogTarget.slotId,
			trimDialogTarget.variantId,
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
		trimPreviewCurrentTime = clampMs(timeMs, trimTimelineStartMs, trimTimelineEndMs) / 1000;
		trimPreviewPaused = true;
	}

	let trimScrubbing = $state(false);

	function onTrimBarPointerDown(event: PointerEvent) {
		if (trimHandleDrag) return;
		event.preventDefault();
		trimScrubbing = true;
		seekTrimBarFromClientX(event.clientX);
	}

	function beginTrimHandleDrag(handle: "start" | "end", event: PointerEvent) {
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

	let hoveredBeatId = $state<string | null>(null);

	$effect(() => {
		onSlotHover?.(hoveredBeatId);
	});

	$effect(() => {
		if (!trimDialogOpen || !trimDialogTarget || !activeTrimDialogVariant) {
			trimPreviewPaused = true;
			trimPreviewKey = "";
			return;
		}

		const nextKey = `${trimDialogTarget.slotId}:${trimDialogTarget.variantId}`;
		if (trimPreviewKey !== nextKey) {
			trimPreviewCurrentTime =
				activeTrimDialogVariant.trimmedStart / 1000;
			trimPreviewPaused = true;
			trimPreviewKey = nextKey;
		}
	});

	$effect(() => {
		if (!trimDialogOpen || !activeTrimDialogVariant) return;

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
		if (trimDialogOpen && trimDialogTarget && !activeTrimDialogVariant) {
			trimDialogOpen = false;
			trimDialogTarget = null;
		}
	});

	// --- DOM refs ---
	let containerEl = $state<HTMLDivElement | null>(null);
	let grabSurfaceEl = $state<HTMLDivElement | null>(null);
	let contentTrackEl = $state<HTMLDivElement | null>(null);
	let variantEls = new Map<string, HTMLElement>();
	let resizeGen = $state(0);
	let hasInitializedPanOffset = $state(false);

	// Svelte action to register variant button elements into the map
	function trackEl(node: HTMLElement, id: string) {
		variantEls.set(id, node);
		tick().then(() => {
			resizeGen++;
		});
		return {
			destroy() {
				variantEls.delete(id);
			},
		};
	}

	// --- Curve computation ---
	interface TreeCurve {
		key: string;
		d: string;
		arrowPoints: string;
		active: boolean;
	}

	import { tick } from "svelte";

	let curves = $derived.by((): TreeCurve[] => {
		void resizeGen;
		if (!contentTrackEl || blocks.length < 2) return [];

		const trackRect = contentTrackEl.getBoundingClientRect();
		const result: TreeCurve[] = [];

		for (let i = 0; i < blocks.length - 1; i++) {
			const leftBlock = blocks[i];
			const rightBlock = blocks[i + 1];

			for (const lv of leftBlock.variants) {
				const lEl = variantEls.get(lv.id);
				if (!lEl) continue;
				const lRect = lEl.getBoundingClientRect();
				const x1 = lRect.right - trackRect.left;
				const y1 = lRect.top + lRect.height / 2 - trackRect.top;

				for (const rv of rightBlock.variants) {
					const rEl = variantEls.get(rv.id);
					if (!rEl) continue;
					const rRect = rEl.getBoundingClientRect();
					const x2 = rRect.left - trackRect.left;
					const y2 = rRect.top + rRect.height / 2 - trackRect.top;

					// Pull endpoints inward so arrowheads aren't clipped by buttons
					const ax1 = x1 + 4;
					const ax2 = x2 - 8;
					if (ax2 <= ax1) continue;
					const midX = (ax1 + ax2) / 2;
					const sameLevel = Math.abs(y1 - y2) < 6;
					const d = sameLevel
						? `M ${ax1},${y1} L ${ax2},${y2}`
						: `M ${ax1},${y1} C ${midX},${y1} ${midX},${y2} ${ax2},${y2}`;
					const arrowWidth = 6;
					const arrowHeight = 3.5;
					const arrowPoints = `${ax2 - arrowWidth},${y2 - arrowHeight} ${ax2},${y2} ${ax2 - arrowWidth},${y2 + arrowHeight}`;

					result.push({
						key: `${lv.id}--${rv.id}`,
						d,
						arrowPoints,
						active: lv.isSelected && rv.isSelected,
					});
				}
			}
		}

		return result;
	});

	// --- ResizeObserver ---
	$effect(() => {
		if (!containerEl) return;
		const track = contentTrackEl;
		let rafId: number;
		const ro = new ResizeObserver(() => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				resizeGen++;
			});
		});
		ro.observe(containerEl);
		if (track) ro.observe(track);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(rafId);
		};
	});

	// Recompute lines when blocks change (selection change produces new array)
	$effect(() => {
		void blocks;
		requestAnimationFrame(() => {
			resizeGen++;
		});
	});

	// Recompute on scroll
	$effect(() => {
		if (!containerEl) return;
		const el = containerEl;
		const onScroll = () => {
			resizeGen++;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	});

	$effect(() => {
		if (blocks.length === 0) {
			hasInitializedPanOffset = false;
			return;
		}

		if (!containerEl || hasInitializedPanOffset) return;

		requestAnimationFrame(() => {
			if (!containerEl || hasInitializedPanOffset) return;
			containerEl.scrollLeft = Math.min(
				PAN_GUTTER_PX,
				containerEl.scrollWidth - containerEl.clientWidth,
			);
			hasInitializedPanOffset = true;
		});
	});

	// --- Grab-to-scroll ---
	let isDragging = $state(false);
	let dragPointerId = $state<number | null>(null);
	let dragStartX = 0;
	let dragStartY = 0;
	let scrollStartX = 0;
	let scrollStartY = 0;

	function onGrabPointerDown(e: PointerEvent) {
		if (!containerEl || !grabSurfaceEl || e.button !== 0) return;

		e.preventDefault();
		isDragging = true;
		dragPointerId = e.pointerId;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		scrollStartX = containerEl.scrollLeft;
		scrollStartY = containerEl.scrollTop;
		grabSurfaceEl.setPointerCapture(e.pointerId);
	}

	function onGrabPointerMove(e: PointerEvent) {
		if (!containerEl || !isDragging || e.pointerId !== dragPointerId)
			return;

		e.preventDefault();
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		containerEl.scrollLeft = scrollStartX - dx;
		containerEl.scrollTop = scrollStartY - dy;
	}

	function stopDragging() {
		if (
			grabSurfaceEl &&
			dragPointerId !== null &&
			grabSurfaceEl.hasPointerCapture(dragPointerId)
		) {
			grabSurfaceEl.releasePointerCapture(dragPointerId);
		}
		isDragging = false;
		dragPointerId = null;
	}

	function onGrabPointerUp(e: PointerEvent) {
		if (!isDragging || e.pointerId !== dragPointerId) return;
		stopDragging();
	}

	function onGrabLostPointerCapture(e: PointerEvent) {
		if (e.pointerId !== dragPointerId) return;
		isDragging = false;
		dragPointerId = null;
	}
</script>

<svelte:window onpointermove={onTrimBarPointerMove} onpointerup={endTrimHandleDrag} />

<div
	bind:this={containerEl}
	role="group"
	class="relative mx-4 mt-px min-h-0 flex-1 overflow-x-auto rounded-md border border-snip-border/60 [scrollbar-width:thin] [scrollbar-color:theme(colors.snip-border)_transparent]"
>
	<div
		bind:this={grabSurfaceEl}
		aria-hidden="true"
		class="absolute inset-0 z-0 rounded-[inherit]"
		style:cursor={isDragging ? "grabbing" : "grab"}
		style="
			touch-action:none;
			user-select:none;
		"
		onpointerdown={onGrabPointerDown}
		onpointermove={onGrabPointerMove}
		onpointerup={onGrabPointerUp}
		onpointercancel={onGrabPointerUp}
		onlostpointercapture={onGrabLostPointerCapture}
	></div>

	<div
		bind:this={contentTrackEl}
		class="pointer-events-none relative z-10 flex min-h-full items-center gap-8 px-4 py-4 pb-2"
		style={`
			width:max-content;
			min-width:calc(100% + ${PAN_GUTTER_PX * 2}px);
			background-color: color-mix(in srgb, var(--snip-surface) 88%, transparent);
			background-image: radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.2) 1px, transparent 0);
			background-size: 18px 18px;
		`}
	>
		<div
			aria-hidden="true"
			class="pointer-events-none shrink-0"
			style={`width:${PAN_GUTTER_PX}px;`}
		></div>

		<!-- Variant columns -->
		{#each blocks as block (block.id)}
			{@const isPlaying =
				currentTimeMs >= block.startMs && currentTimeMs < block.endMs}
			{@const script = slotScriptText(block)}
			{@const primaryVariant = primaryVariantForBlock(block)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class={cn(
					"pointer-events-auto relative flex min-w-[140px] shrink-0 flex-col gap-2 rounded-sm border border-snip-border/85 px-2 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.22)] transition-colors duration-300",
					isPlaying ? "border-primary/50 ring-1 ring-primary/30" : "",
				)}
				style="background-color: color-mix(in srgb, var(--snip-surface-elevated) 92%, white 4%);"
				onmouseenter={() => (hoveredBeatId = block.beatId)}
				onmouseleave={() => (hoveredBeatId = null)}
			>
				<HoverCard openDelay={200} closeDelay={100} disabled={!script}>
					<HoverCardTrigger>
						{#snippet child({ props })}
							<button
								type="button"
								{...props}
								class={cn(
									"flex w-full flex-col gap-0.5 rounded-sm px-0.5 text-left transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
									props.class as string | undefined,
								)}
								disabled={!primaryVariant}
								onclick={() =>
									primaryVariant &&
									onSelectVariant(
										block.beatId,
										primaryVariant.variantId,
										primaryVariant.start,
									)}
							>
								<div class="flex items-center gap-1.5">
									<div
										class="size-2 shrink-0 rounded-full"
										style={`background:${block.color};`}
									></div>
									<span class="truncate text-[10px] font-medium text-snip-text-secondary">
										{block.humanLabel}
									</span>
								</div>
								<span class="font-mono text-[8px] tabular-nums text-snip-text-secondary">
									{formatDuration(block.startMs)} -
									{formatDuration(block.endMs)}
								</span>
							</button>
						{/snippet}
					</HoverCardTrigger>
					<HoverCardContent
						side="top"
						align="center"
						sideOffset={8}
						class="max-w-xs border-snip-border bg-snip-surface-elevated p-3 text-xs leading-relaxed text-snip-text-primary shadow-xl ring-0"
					>
						<p class="text-pretty">{script}</p>
					</HoverCardContent>
				</HoverCard>
				{#each block.variants as variant, takeIdx (variant.id)}
					<button
						type="button"
						use:trackEl={variant.id}
						class="relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-sm border px-3 py-2 text-left transition-colors hover:border-primary/60 {variant.isSelected
							? 'border-primary bg-primary/10'
							: 'border-snip-border bg-snip-surface'}"
						onclick={() =>
							onSelectVariant(
								block.beatId,
								variant.variantId,
								variant.start,
							)}
					>
						<span
							class="truncate text-xs {variant.isSelected
								? 'font-medium text-white'
								: 'text-snip-text-secondary'}"
						>
							Take {takeIdx + 1}
						</span>
						<span
							class="shrink-0 font-mono text-[10px] text-snip-text-secondary"
						>
							{formatDuration(variant.trimmedDurationMs)}
						</span>
					</button>
					{#if variant.isSelected && onTrimVariant}
						{@const trim = variant.trimOffset ?? {
							startOffsetMs: 0,
							endOffsetMs: 0,
						}}
						{@const hasTrim =
							trim.startOffsetMs !== 0 || trim.endOffsetMs !== 0}
						<button
							type="button"
							class="flex w-full items-center justify-between gap-1.5 rounded-sm border border-snip-border/40 bg-snip-bg/40 px-2 py-1 text-left transition-colors hover:border-primary/40 hover:bg-snip-bg/55"
							aria-label={`Edit trim for ${block.humanLabel}, take ${takeIdx + 1}`}
							onclick={(e) => {
								e.stopPropagation();
								openTrimDialog(
									block.beatId,
									variant.variantId,
									`Take ${takeIdx + 1}`,
									block.humanLabel,
								);
							}}
						>
							<div
								class="flex items-center gap-2 font-mono text-[9px] tabular-nums text-snip-text-secondary"
							>
								<span class={hasTrim ? "text-primary" : ""}>
									{formatOffset(trim.startOffsetMs)}
								</span>
								<span class="text-snip-text-secondary/50"
									>/</span
								>
								<span class={hasTrim ? "text-primary" : ""}>
									{formatOffset(trim.endOffsetMs)}
								</span>
							</div>
							<span
								class="flex size-5 items-center justify-center rounded text-snip-text-muted"
							>
								<PencilIcon
									class="size-2.5 text-snip-text-muted"
								/>
							</span>
						</button>
					{/if}
				{/each}
			</div>
		{/each}

		<div
			aria-hidden="true"
			class="pointer-events-none shrink-0"
			style={`width:${PAN_GUTTER_PX}px;`}
		></div>

		<!-- SVG line overlay — rendered AFTER blocks so it naturally paints on top -->
		<svg
			class="pointer-events-none absolute inset-0 z-40 h-full w-full overflow-visible"
		>
			<defs>
				<filter id="active-glow">
					<feGaussianBlur stdDeviation="2" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			{#each curves as curve (curve.key)}
				<g filter={curve.active ? "url(#active-glow)" : "none"}>
					<path
						d={curve.d}
						fill="none"
						stroke={curve.active
							? "var(--primary)"
							: "var(--snip-border)"}
						stroke-width={curve.active ? 2 : 1.5}
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-opacity={curve.active ? 0.9 : 0.35}
						shape-rendering="geometricPrecision"
						style="transition: stroke-opacity 300ms ease, stroke-width 300ms ease, stroke 300ms ease;"
					/>
					<polygon
						points={curve.arrowPoints}
						fill={curve.active
							? "var(--primary)"
							: "var(--snip-border)"}
						fill-opacity={curve.active ? 0.95 : 0.55}
						style="transition: fill-opacity 300ms ease, fill 300ms ease;"
					/>
				</g>
			{/each}
		</svg>
	</div>
</div>

{#if trimDialogTarget && onTrimVariant}
	{@const target = trimDialogTarget}
	<Dialog.Root bind:open={trimDialogOpen}>
		<Dialog.Content
			class="gap-0 overflow-hidden border-snip-border bg-snip-surface p-0 sm:max-w-lg"
		>
			<div
				class="flex flex-col gap-1 border-b border-snip-border/50 px-5 pt-5 pb-4"
			>
				<Dialog.Title class="font-display text-sm font-bold text-white">
					Trim {target.humanLabel} &mdash; {target.takeLabel}
				</Dialog.Title>
				<Dialog.Description
					class="text-[12px] text-snip-text-secondary"
				>
					Preview the clip, then drag either edge of the trim bar.
				</Dialog.Description>
			</div>

			<div class="space-y-4 px-5 py-4">
				{#if videoUrl}
					<div
						class="overflow-hidden rounded-[18px] border border-snip-border/60 bg-black shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
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
									class="flex size-14 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm"
								>
									{#if trimPreviewPaused}
										<PlayIcon class="ml-0.5 size-6" />
									{:else}
										<PauseIcon class="size-6" />
									{/if}
								</span>
							</button>
						</div>
					</div>
				{:else}
					<div
						class="flex aspect-video items-center justify-center rounded-[18px] border border-dashed border-snip-border/60 bg-snip-surface/45 px-6 text-center text-[12px] leading-5 text-snip-text-muted"
					>
						Upload a source clip to preview trim changes here.
					</div>
				{/if}

				<div class="space-y-1.5 rounded-xl border border-snip-border/50 bg-snip-bg/45 p-4">
					<!-- Time ruler -->
					<div class="relative h-5 select-none">
						{#each trimTickMarks as tick (tick.id)}
							<div
								class="absolute bottom-0 -translate-x-1/2"
								style={`left:${tick.leftPct}%;`}
							>
								<div class="flex flex-col items-center">
									{#if tick.isMajor}
										<span class="mb-0.5 font-mono text-[8px] leading-none text-snip-text-muted">
											{tick.label}
										</span>
										<div class="h-2 w-px bg-snip-border/70"></div>
									{:else}
										<div class="h-1 w-px bg-snip-border/35"></div>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					<!-- Unified NLE-style trim bar -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						bind:this={trimBarEl}
						class="relative h-16 cursor-pointer touch-none select-none overflow-hidden rounded-lg border border-snip-border/30"
						style="background: rgba(255,255,255,0.03);"
						onpointerdown={onTrimBarPointerDown}
					>
						<!-- Active trimmed region -->
						<div
							class="absolute inset-y-0 border-y-2 border-primary/40 bg-primary/[0.12]"
							style={`left:${trimStartPct}%; width:${Math.max(trimEndPct - trimStartPct, 0)}%;`}
						></div>

						<!-- Dimmed overlay: before trim -->
						<div
							class="absolute inset-y-0 left-0 bg-black/40"
							style={`width:${trimStartPct}%;`}
						></div>
						<!-- Dimmed overlay: after trim -->
						<div
							class="absolute inset-y-0 bg-black/40"
							style={`left:${trimEndPct}%; right:0;`}
						></div>

						<!-- Word markers -->
						{#each activeTrimWordMarkers as marker (marker.id)}
							<div
								class="absolute bottom-0 z-10 -translate-x-1/2"
								style={`left:${marker.leftPct}%;`}
								title={`${marker.text} (${formatPreviewTimestamp(marker.startMs)})`}
							>
								<div class="h-3 w-px bg-primary/25"></div>
							</div>
						{/each}

						<!-- Left trim handle -->
						<div
							class="absolute inset-y-0 z-20 flex w-[10px] cursor-ew-resize items-center justify-center rounded-l-[5px] bg-primary shadow-[2px_0_8px_rgba(0,0,0,0.3)] transition-colors hover:brightness-110"
							style={`left:${trimStartPct}%;`}
							role="slider"
							aria-label="Trim start"
							aria-valuemin={trimTimelineStartMs}
							aria-valuemax={activeTrimEndMs}
							aria-valuenow={activeTrimStartMs}
							tabindex="0"
							onpointerdown={(event) => beginTrimHandleDrag("start", event)}
						>
							<div class="flex flex-col gap-[3px]">
								<div class="h-px w-[5px] rounded-full bg-white/60"></div>
								<div class="h-px w-[5px] rounded-full bg-white/60"></div>
								<div class="h-px w-[5px] rounded-full bg-white/60"></div>
							</div>
						</div>

						<!-- Right trim handle -->
						<div
							class="absolute inset-y-0 z-20 flex w-[10px] -translate-x-full cursor-ew-resize items-center justify-center rounded-r-[5px] bg-primary shadow-[-2px_0_8px_rgba(0,0,0,0.3)] transition-colors hover:brightness-110"
							style={`left:${trimEndPct}%;`}
							role="slider"
							aria-label="Trim end"
							aria-valuemin={activeTrimStartMs}
							aria-valuemax={trimTimelineEndMs}
							aria-valuenow={activeTrimEndMs}
							tabindex="0"
							onpointerdown={(event) => beginTrimHandleDrag("end", event)}
						>
							<div class="flex flex-col gap-[3px]">
								<div class="h-px w-[5px] rounded-full bg-white/60"></div>
								<div class="h-px w-[5px] rounded-full bg-white/60"></div>
								<div class="h-px w-[5px] rounded-full bg-white/60"></div>
							</div>
						</div>

						<!-- Playhead -->
						<div
							class="pointer-events-none absolute inset-y-0 z-30 w-px -translate-x-1/2 bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.3)]"
							style={`left:${timeToPct(trimPreviewCurrentTime * 1000)}%;`}
						>
							<div class="absolute -top-px left-1/2 -translate-x-1/2">
								<div class="size-1.5 rounded-full bg-white"></div>
							</div>
						</div>
					</div>

					<!-- Bottom timestamps -->
					<div class="flex items-center justify-between px-0.5 font-mono text-[10px] tabular-nums">
						<span class="text-snip-text-secondary">{formatPreviewTimestamp(activeTrimStartMs)}</span>
						<span class="text-snip-text-muted">{formatDuration(Math.max(activeTrimEndMs - activeTrimStartMs, 0))}</span>
						<span class="text-snip-text-secondary">{formatPreviewTimestamp(activeTrimEndMs)}</span>
					</div>
				</div>
			</div>

			<div
				class="flex items-center justify-between border-t border-snip-border/50 px-5 py-3"
			>
				<button
					type="button"
					disabled={!activeTrimHasTrim}
					class="flex items-center gap-1.5 text-[11px] text-snip-text-muted transition-opacity hover:text-white disabled:pointer-events-none disabled:opacity-30"
					onclick={() =>
						onClearTrim?.(target.slotId, target.variantId)}
				>
					<RotateCcwIcon class="size-3" />
					Reset
				</button>
				<Button
					size="sm"
					onclick={() => (trimDialogOpen = false)}
					class="font-display px-5"
				>
					Done
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
