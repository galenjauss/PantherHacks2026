<script lang="ts">
	import {
		HoverCard,
		HoverCardContent,
		HoverCardTrigger
	} from "$lib/components/ui/hover-card";
	import { cn } from "$lib/utils.js";
	import type { EditorClipStripBeatBlock } from "$lib/stores/video-editor.svelte";

	interface Props {
		blocks: EditorClipStripBeatBlock[];
		currentTimeMs: number;
		formatDuration: (ms: number) => string;
		onSlotHover?: (beatId: string | null) => void;
		onSelectVariant: (slotId: string, variantId: string, startMs: number) => void;
	}

	let { blocks, currentTimeMs, formatDuration, onSlotHover, onSelectVariant }: Props = $props();

	function slotScriptText(block: EditorClipStripBeatBlock): string {
		const selected = block.variants.find((v) => v.isSelected);
		return (selected?.previewText ?? block.variants[0]?.previewText ?? "").trim();
	}

	let hoveredBeatId = $state<string | null>(null);

	$effect(() => {
		onSlotHover?.(hoveredBeatId);
	});

	// --- DOM refs ---
	let containerEl = $state<HTMLDivElement | null>(null);
	let variantEls = new Map<string, HTMLElement>();
	let resizeGen = $state(0);

	// Svelte action to register variant button elements into the map
	function trackEl(node: HTMLElement, id: string) {
		variantEls.set(id, node);
		tick().then(() => { resizeGen++; });
		return {
			destroy() {
				variantEls.delete(id);
			}
		};
	}

	// --- Curve computation ---
	interface TreeCurve {
		key: string;
		d: string;
		active: boolean;
	}

	import { tick } from "svelte";

	let curves = $derived.by((): TreeCurve[] => {
		void resizeGen;
		if (!containerEl || blocks.length < 2) return [];

		const containerRect = containerEl.getBoundingClientRect();
		const scrollLeft = containerEl.scrollLeft;
		const scrollTop = containerEl.scrollTop;
		const result: TreeCurve[] = [];

		for (let i = 0; i < blocks.length - 1; i++) {
			const leftBlock = blocks[i];
			const rightBlock = blocks[i + 1];

			for (const lv of leftBlock.variants) {
				const lEl = variantEls.get(lv.id);
				if (!lEl) continue;
				const lRect = lEl.getBoundingClientRect();
				const x1 = lRect.right - containerRect.left + scrollLeft;
				const y1 = lRect.top + lRect.height / 2 - containerRect.top + scrollTop;

				for (const rv of rightBlock.variants) {
					const rEl = variantEls.get(rv.id);
					if (!rEl) continue;
					const rRect = rEl.getBoundingClientRect();
					const x2 = rRect.left - containerRect.left + scrollLeft;
					const y2 = rRect.top + rRect.height / 2 - containerRect.top + scrollTop;

					// Pull endpoints inward so arrowheads aren't clipped by buttons
					const ax1 = x1 + 4;
					const ax2 = x2 - 8;
					if (ax2 <= ax1) continue;
					const midX = (ax1 + ax2) / 2;

					const sameLevel = Math.abs(y1 - y2) < 6;

					// Always use a bezier: gentle bump for same-level so the path
					// is never a perfectly horizontal segment (avoids rendering issues
					// where thin, low-opacity horizontal strokes can vanish).
					const bump = sameLevel ? 0.8 : 0;
					const cy1 = y1 - bump;
					const cy2 = y2 + bump;
					const d = `M ${ax1},${y1} C ${midX},${cy1} ${midX},${cy2} ${ax2},${y2}`;

					result.push({
						key: `${lv.id}--${rv.id}`,
						d,
						active: lv.isSelected && rv.isSelected
					});
				}
			}
		}

		return result;
	});

	// --- ResizeObserver ---
	$effect(() => {
		if (!containerEl) return;
		let rafId: number;
		const ro = new ResizeObserver(() => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				resizeGen++;
			});
		});
		ro.observe(containerEl);
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
</script>

<div
	bind:this={containerEl}
	class="relative mx-4 mt-px flex min-h-0 flex-1 items-center gap-8 overflow-x-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
	<!-- Variant columns -->
	{#each blocks as block (block.id)}
		{@const isPlaying = currentTimeMs >= block.startMs && currentTimeMs < block.endMs}
		{@const script = slotScriptText(block)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class={cn(
				"relative flex min-w-[140px] shrink-0 flex-col gap-2 rounded-sm px-2 py-2 transition-colors duration-300",
				isPlaying ? "bg-primary/5 ring-1 ring-primary/30" : ""
			)}
			onmouseenter={() => (hoveredBeatId = block.beatId)}
			onmouseleave={() => (hoveredBeatId = null)}
		>
			<HoverCard openDelay={200} closeDelay={100} disabled={!script}>
				<HoverCardTrigger>
					{#snippet child({ props })}
						<div {...props} class={cn("flex flex-col gap-0.5 px-0.5", props.class as string | undefined)}>
							<div class="flex items-center gap-1.5">
								<div
									class="size-2 shrink-0 rounded-full"
									style="background:{block.color};"
								></div>
								<span class="truncate text-[10px] font-medium text-snip-text-secondary">
									{block.humanLabel}
								</span>
							</div>
							<span class="font-mono text-[8px] tabular-nums text-snip-text-muted">
								{formatDuration(block.startMs)} – {formatDuration(block.endMs)}
							</span>
						</div>
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
					onclick={() => onSelectVariant(block.beatId, variant.variantId, variant.start)}
				>
					<span
						class="truncate text-xs {variant.isSelected
							? 'font-medium text-white'
							: 'text-snip-text-secondary'}"
					>
						Take {takeIdx + 1}
					</span>
					<span class="shrink-0 font-mono text-[10px] text-snip-text-muted">
						{formatDuration(variant.durationMs)}
					</span>
				</button>
			{/each}
		</div>
	{/each}

	<!-- SVG line overlay — rendered AFTER blocks so it naturally paints on top -->
	<svg class="pointer-events-none absolute inset-0 z-40 h-full w-full overflow-visible">
		<defs>
			<filter id="active-glow">
				<feGaussianBlur stdDeviation="2" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
			<marker
				id="arrow-active"
				viewBox="0 0 6 6"
				refX="5"
				refY="3"
				markerWidth="5"
				markerHeight="5"
				orient="auto"
			>
				<path d="M 0 0.5 L 5 3 L 0 5.5 z" fill="var(--primary)" />
			</marker>
			<marker
				id="arrow-inactive"
				viewBox="0 0 6 6"
				refX="5"
				refY="3"
				markerWidth="5"
				markerHeight="5"
				orient="auto"
			>
				<path d="M 0 0.5 L 5 3 L 0 5.5 z" fill="var(--snip-border)" opacity="0.6" />
			</marker>
		</defs>
		{#each curves as curve (curve.key)}
			<path
				d={curve.d}
				fill="none"
				stroke={curve.active ? "var(--primary)" : "var(--snip-border)"}
				stroke-width={curve.active ? 2 : 1.5}
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-opacity={curve.active ? 0.9 : 0.35}
				shape-rendering="geometricPrecision"
				filter={curve.active ? "url(#active-glow)" : "none"}
				marker-end={curve.active ? "url(#arrow-active)" : "url(#arrow-inactive)"}
				style="transition: stroke-opacity 300ms ease, stroke-width 300ms ease, stroke 300ms ease;"
			/>
		{/each}
	</svg>
</div>
