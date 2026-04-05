<script lang="ts">
	import {
		HoverCard,
		HoverCardContent,
		HoverCardTrigger,
	} from "$lib/components/ui/hover-card";
	import { cn } from "$lib/utils.js";
	import type { AutocutTranscriptWord } from "$lib/types/autocut";
	import type { EditorClipStripBeatBlock } from "$lib/stores/video-editor.svelte";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import TrimDialog from "./TrimDialog.svelte";

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

	const PAN_GUTTER_PX = 240;

	let trimDialogOpen = $state(false);

	interface TrimDialogTarget {
		slotId: string;
		variantId: string;
		takeLabel: string;
		humanLabel: string;
	}

	let trimDialogTarget = $state<TrimDialogTarget | null>(null);

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

	let hoveredBeatId = $state<string | null>(null);

	$effect(() => {
		onSlotHover?.(hoveredBeatId);
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

<TrimDialog
	bind:open={trimDialogOpen}
	target={trimDialogTarget}
	{blocks}
	{videoUrl}
	{transcriptWords}
	{formatDuration}
	{onTrimVariant}
	{onClearTrim}
	onOpenChange={(v) => {
		trimDialogOpen = v;
		if (!v) trimDialogTarget = null;
	}}
/>
