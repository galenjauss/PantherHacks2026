<script lang="ts">
	interface BeatRegion {
		startMs: number;
		endMs: number;
		color: string;
		previewText?: string;
	}

	interface Props {
		currentTimeMs: number;
		totalDurationMs: number;
		beatRegions: BeatRegion[];
		formatClock: (ms: number) => string;
		onSeek: (timeMs: number) => void;
	}

	let { currentTimeMs, totalDurationMs, beatRegions, formatClock, onSeek }: Props = $props();

	let trackEl = $state<HTMLDivElement | null>(null);
	let isScrubbing = $state(false);

	let progressPct = $derived(
		totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0
	);

	// --- Time ruler ticks ---
	const TICK_COUNT = 6;
	let ticks = $derived.by(() => {
		if (totalDurationMs <= 0) return [];
		return Array.from({ length: TICK_COUNT }, (_, i) => {
			const ms = Math.round((totalDurationMs / (TICK_COUNT - 1)) * i);
			return { id: `tick-${i}`, ms, label: formatClock(ms) };
		});
	});

	// --- Seek from pointer event ---
	function seekFromPointer(e: PointerEvent) {
		if (!trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		onSeek(Math.round(ratio * totalDurationMs));
	}

	function handlePointerDown(e: PointerEvent) {
		if (!trackEl) return;
		isScrubbing = true;
		trackEl.setPointerCapture(e.pointerId);
		seekFromPointer(e);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isScrubbing) return;
		seekFromPointer(e);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!trackEl) return;
		trackEl.releasePointerCapture(e.pointerId);
		isScrubbing = false;
	}

	function handleLostPointerCapture() {
		isScrubbing = false;
	}

	// --- Region hover tooltip ---
	let hoveredRegionIdx = $state<number | null>(null);
	let regionHoverPct = $state(0);

	let hoveredRegionText = $derived.by(() => {
		if (hoveredRegionIdx === null) return "";
		const text = beatRegions[hoveredRegionIdx]?.previewText ?? "";
		return text.length > 200 ? text.slice(0, 197) + "..." : text;
	});

	function handleRegionEnter(idx: number, e: MouseEvent) {
		if (isScrubbing) return;
		hoveredRegionIdx = idx;
		updateRegionHoverPct(e);
	}

	function handleRegionMove(e: MouseEvent) {
		if (isScrubbing || hoveredRegionIdx === null) return;
		updateRegionHoverPct(e);
	}

	function handleRegionLeave() {
		hoveredRegionIdx = null;
	}

	function updateRegionHoverPct(e: MouseEvent) {
		if (!trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		regionHoverPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
	}

	// --- Keyboard seek ---
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "ArrowRight") {
			e.preventDefault();
			onSeek(Math.min(currentTimeMs + (e.shiftKey ? 5000 : 1000), totalDurationMs));
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			onSeek(Math.max(currentTimeMs - (e.shiftKey ? 5000 : 1000), 0));
		}
	}
</script>

<div class="flex flex-col gap-1 px-4">
	<!-- Time ruler -->
	<div class="relative h-3.5">
		{#each ticks as tick, i (tick.id)}
			<div
				class="absolute top-0 flex flex-col items-center"
				style="left:{(i / (TICK_COUNT - 1)) * 100}%;transform:translateX({i === 0 ? '0' : i === TICK_COUNT - 1 ? '-100%' : '-50%'});"
			>
				<div class="h-[4px] w-px bg-snip-text-muted/40"></div>
				<span class="mt-px font-mono text-[8px] tabular-nums text-snip-text-muted">{tick.label}</span>
			</div>
		{/each}
	</div>

	<!-- Scrub track -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={trackEl}
		class="group relative h-5 cursor-pointer overflow-hidden rounded-sm bg-snip-bg"
		role="slider"
		aria-valuemin={0}
		aria-valuemax={totalDurationMs}
		aria-valuenow={Math.round(currentTimeMs)}
		aria-label="Video timeline scrubber"
		tabindex={0}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onlostpointercapture={handleLostPointerCapture}
		onkeydown={handleKeyDown}
	>
		<!-- Beat regions -->
		{#each beatRegions as region, idx}
			{@const left = (region.startMs / totalDurationMs) * 100}
			{@const width = ((region.endMs - region.startMs) / totalDurationMs) * 100}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-y-0"
				style="left:{left}%;width:{width}%;background:{region.color}60;"
				onmouseenter={(e) => handleRegionEnter(idx, e)}
				onmousemove={handleRegionMove}
				onmouseleave={handleRegionLeave}
			></div>
		{/each}

		<!-- Elapsed fill -->
		<div
			class="pointer-events-none absolute inset-y-0 left-0 bg-primary/20"
			style="width:{progressPct}%;"
		></div>

		<!-- Playhead -->
		<div
			class="pointer-events-none absolute inset-y-0 w-0.5 bg-primary transition-[left] duration-75 ease-linear"
			style="left:{progressPct}%;"
		>
			<!-- Handle circle -->
			<div
				class="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_6px_var(--primary)] transition-transform duration-100
					{isScrubbing ? 'scale-150' : 'scale-100 group-hover:scale-125'}"
			></div>
		</div>

		<!-- Drag tooltip -->
		{#if isScrubbing}
			<div
				class="pointer-events-none absolute -top-7 whitespace-nowrap rounded-sm border border-snip-border bg-snip-surface px-1.5 py-0.5 font-mono text-[10px] text-primary"
				style="left:{progressPct}%;transform:translateX(-50%);"
			>
				{formatClock(currentTimeMs)}
			</div>
		{/if}

		<!-- Region hover tooltip -->
		{#if !isScrubbing && hoveredRegionText}
			<div
				class="pointer-events-none absolute -top-9 max-w-[220px] rounded-sm border border-snip-border bg-snip-surface px-2.5 py-1.5 text-[10px] leading-relaxed text-snip-text-secondary shadow-lg"
				style="left:{regionHoverPct}%;transform:translateX(-50%);"
			>
				{hoveredRegionText}
			</div>
		{/if}
	</div>

	<!-- Time display -->
	<div class="flex justify-between font-mono text-[9px] tabular-nums text-snip-text-muted">
		<span>{formatClock(currentTimeMs)}</span>
		<span>{formatClock(totalDurationMs)}</span>
	</div>
</div>
