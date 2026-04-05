<script lang="ts">
	import type { EditorClipStripBeatBlock } from "$lib/stores/video-editor.svelte";

	interface Props {
		blocks: EditorClipStripBeatBlock[];
		formatDuration: (ms: number) => string;
		onSelectVariant: (slotId: string, variantId: string, startMs: number) => void;
	}

	let { blocks, formatDuration, onSelectVariant }: Props = $props();

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

	// --- Line computation ---
	interface TreeLine {
		key: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		active: boolean;
	}

	import { tick } from "svelte";

	let lines = $derived.by((): TreeLine[] => {
		void resizeGen;
		if (!containerEl || blocks.length < 2) return [];

		const containerRect = containerEl.getBoundingClientRect();
		const scrollLeft = containerEl.scrollLeft;
		const scrollTop = containerEl.scrollTop;
		const result: TreeLine[] = [];

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

					result.push({
						key: `${lv.id}--${rv.id}`,
						x1,
						y1,
						x2,
						y2,
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
	class="relative mx-4 mt-px flex min-h-0 flex-1 items-start gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
	<!-- SVG line overlay -->
	<svg class="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
		<defs>
			<filter id="active-glow">
				<feGaussianBlur stdDeviation="2" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>
		{#each lines as line (line.key)}
			<line
				x1={line.x1}
				y1={line.y1}
				x2={line.x2}
				y2={line.y2}
				stroke={line.active ? "var(--primary)" : "var(--snip-border)"}
				stroke-width={line.active ? 2 : 1}
				stroke-opacity={line.active ? 0.9 : 0.12}
				filter={line.active ? "url(#active-glow)" : "none"}
				style="transition: stroke-opacity 300ms ease, stroke-width 300ms ease, stroke 300ms ease;"
			/>
		{/each}
	</svg>

	<!-- Variant columns -->
	{#each blocks as block (block.id)}
		<div class="flex min-w-[90px] flex-col gap-0.5" style="width:{block.widthPct}%;">
			<span
				class="truncate px-1 pt-1 font-mono text-[8px] uppercase tracking-[0.15em] text-snip-text-muted"
			>
				{block.beatId.replace(/^slot_/, "S")}
			</span>
			{#each block.variants as variant, takeIdx (variant.id)}
				<button
					type="button"
					use:trackEl={variant.id}
					class="relative z-20 flex items-center justify-between gap-1 overflow-hidden border px-2 py-[3px] text-left transition-colors hover:border-primary/60 {variant.isSelected
						? 'border-primary bg-primary/10'
						: 'border-snip-border bg-snip-surface'}"
					style="border-radius:4px;"
					onclick={() => onSelectVariant(block.beatId, variant.variantId, variant.start)}
				>
					<span
						class="truncate text-[10px] {variant.isSelected
							? 'font-medium text-white'
							: 'text-snip-text-secondary'}"
					>
						Take {takeIdx + 1}
					</span>
					<span class="shrink-0 font-mono text-[9px] text-snip-text-muted">
						{formatDuration(variant.durationMs)}
					</span>
				</button>
			{/each}
		</div>
	{/each}
</div>
