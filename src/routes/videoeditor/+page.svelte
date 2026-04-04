<script lang="ts">
	import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { isProcessed as processedStore } from "$lib/stores/snip";
	import VideoPreview from "$lib/components/main/VideoPreview.svelte";
	import FilesPanel from "$lib/components/sidebar/FilesPanel.svelte";
	import SnipAIPanel from "$lib/components/sidebar/SnipAIPanel.svelte";
	import AnalysisPanel from "$lib/components/sidebar/AnalysisPanel.svelte";
	import CutSettingsPanel from "$lib/components/sidebar/CutSettingsPanel.svelte";

	// ── State machine ─────────────────────────────────────────────────
	let isProcessed = $state(false);
	let isProcessing = $state(true);
	let analysisStep = $state(3); // 1-indexed active step; 6 = all done
	let naturalness = $state(3); // 1-5 slider
	let aggressiveness = $state(50); // 0-100 slider

	type CutToggles = {
		filler: boolean;
		pauses: boolean;
		restarts: boolean;
		mouthSounds: boolean;
		longPauses: boolean;
	};
	let cutToggles = $state<CutToggles>({
		filler: true,
		pauses: true,
		restarts: true,
		mouthSounds: false,
		longPauses: false,
	});

	let applyingCuts = $state(false);

	// Keep layout store in sync with local isProcessed
	$effect(() => {
		processedStore.set(isProcessed);
	});

	// ── Derived ──────────────────────────────────────────────────────
	const CUT_COUNTS = {
		filler: 147,
		pauses: 38,
		restarts: 22,
		mouthSounds: 14,
		longPauses: 8,
	} as Record<keyof CutToggles, number>;
	const CUT_SAVINGS = {
		filler: 152,
		pauses: 46,
		restarts: 26,
		mouthSounds: 8,
		longPauses: 24,
	} as Record<keyof CutToggles, number>;

	const activeCuts = $derived(
		(Object.keys(cutToggles) as (keyof CutToggles)[])
			.filter((k) => cutToggles[k])
			.reduce((sum, k) => sum + CUT_COUNTS[k], 0),
	);
	const savedSecs = $derived(
		(Object.keys(cutToggles) as (keyof CutToggles)[])
			.filter((k) => cutToggles[k])
			.reduce((sum, k) => sum + CUT_SAVINGS[k], 0),
	);
	const savingsStr = $derived(
		`${Math.floor(savedSecs / 60)}m ${String(savedSecs % 60).padStart(2, "0")}s`,
	);

	// ── Processing simulation ─────────────────────────────────────────
	onMount(() => {
		// Advance step every 800ms while processing (3 → 4 → 5)
		const stepTimer = setInterval(() => {
			if (analysisStep < 5) analysisStep++;
		}, 800);

		// After 3s: mark analysis done, show all-done state for 1s
		const doneTimer = setTimeout(() => {
			clearInterval(stepTimer);
			analysisStep = 6; // beyond total → all ✓
			isProcessing = false;
		}, 3000);

		// After 4s (3 + 1): transition to processed UI
		const processedTimer = setTimeout(() => {
			isProcessed = true;
		}, 4000);

		return () => {
			clearInterval(stepTimer);
			clearTimeout(doneTimer);
			clearTimeout(processedTimer);
		};
	});

	// ── Handlers ─────────────────────────────────────────────────────
	function handleApplyCuts() {
		if (applyingCuts) return;
		applyingCuts = true;
		setTimeout(() => {
			applyingCuts = false;
		}, 1500);
	}

	// ── Clip list ────────────────────────────────────────────────────
	let activeFilter = $state("all");

	const filters = [
		{ id: "all", label: "All", count: 47, color: null },
		{ id: "filler", label: "Filler", count: 18, color: "#f97316" },
		{ id: "pause", label: "Pause", count: 14, color: "#3b82f6" },
		{ id: "mouth", label: "Mouth", count: 9, color: "#eab308" },
		{ id: "long", label: "Long pause", count: 6, color: "#a855f7" },
		{ id: "restart", label: "Restart", count: 3, color: "#22c55e" },
	];

	const clips = [
		{
			id: 1,
			type: "filler",
			label: '"uh"',
			time: "0:08",
			dur: "0.4s",
			color: "#f97316",
		},
		{
			id: 2,
			type: "pause",
			label: "Silence",
			time: "0:14",
			dur: "1.2s",
			color: "#3b82f6",
		},
		{
			id: 3,
			type: "filler",
			label: '"um, so"',
			time: "0:23",
			dur: "0.8s",
			color: "#f97316",
		},
		{
			id: 4,
			type: "mouth",
			label: "Mouth click",
			time: "0:31",
			dur: "0.1s",
			color: "#eab308",
		},
		{
			id: 5,
			type: "long",
			label: "Long silence",
			time: "0:45",
			dur: "3.1s",
			color: "#a855f7",
		},
		{
			id: 6,
			type: "filler",
			label: '"like, you know"',
			time: "1:02",
			dur: "1.1s",
			color: "#f97316",
		},
		{
			id: 7,
			type: "pause",
			label: "Silence",
			time: "1:19",
			dur: "0.9s",
			color: "#3b82f6",
		},
		{
			id: 8,
			type: "filler",
			label: '"basically"',
			time: "1:34",
			dur: "0.6s",
			color: "#f97316",
		},
		{
			id: 9,
			type: "mouth",
			label: "Lip smack",
			time: "1:47",
			dur: "0.2s",
			color: "#eab308",
		},
		{
			id: 10,
			type: "restart",
			label: "False start",
			time: "2:03",
			dur: "2.4s",
			color: "#22c55e",
		},
		{
			id: 11,
			type: "filler",
			label: '"right?"',
			time: "2:28",
			dur: "0.5s",
			color: "#f97316",
		},
		{
			id: 12,
			type: "pause",
			label: "Silence",
			time: "2:41",
			dur: "0.7s",
			color: "#3b82f6",
		},
		{
			id: 13,
			type: "filler",
			label: '"I mean"',
			time: "3:05",
			dur: "0.7s",
			color: "#f97316",
		},
		{
			id: 14,
			type: "mouth",
			label: "Breath",
			time: "3:18",
			dur: "0.3s",
			color: "#eab308",
		},
		{
			id: 15,
			type: "long",
			label: "Long silence",
			time: "3:44",
			dur: "4.2s",
			color: "#a855f7",
		},
		{
			id: 16,
			type: "filler",
			label: '"sort of"',
			time: "4:01",
			dur: "0.5s",
			color: "#f97316",
		},
		{
			id: 17,
			type: "pause",
			label: "Silence",
			time: "4:22",
			dur: "0.8s",
			color: "#3b82f6",
		},
	];

	const waveBarHeights = Array.from({ length: 96 }, (_, i) =>
		Math.round(
			8 +
				Math.abs(Math.sin(i * 0.31) * 18) +
				Math.abs(Math.sin(i * 0.73) * 12),
		),
	);

	function miniBarHeight(clipId: number, barIdx: number): number {
		return Math.round(
			3 + Math.abs(Math.sin(clipId * 2.3 + barIdx * 0.85) * 9),
		);
	}

	const visibleClips = $derived(
		activeFilter === "all"
			? clips
			: clips.filter((c) => c.type === activeFilter),
	);

	let selected = $state(new Set(clips.map((c) => c.id)));
</script>

<!-- Full-height flex row: sidebar + main -->
<div class="flex h-full">
	<!-- ── Left sidebar ──────────────────────────────────────────────── -->
	<aside
		class="w-[368px] flex-shrink-0 bg-[#111111] border-r border-[#222222] flex flex-col overflow-hidden"
	>
		<FilesPanel {isProcessing} />

		<div class="border-t border-[#222222]"></div>

		{#if !isProcessed}
			<div transition:fade={{ duration: 200 }} class="flex flex-col">
				<SnipAIPanel step={analysisStep} />
				<div class="border-t border-[#222222]"></div>
				<AnalysisPanel />
			</div>
		{:else}
			<div transition:fade={{ duration: 200 }} class="flex flex-col">
				<CutSettingsPanel
					bind:cutToggles
					bind:aggressiveness
					{activeCuts}
					{savingsStr}
					applying={applyingCuts}
					onApply={handleApplyCuts}
				/>
			</div>
		{/if}

		<div class="border-t border-[#222222]"></div>

		<!-- ── Detected cuts section ────────────────────────────────── -->
		<div class="px-4 pt-4 pb-3 border-b border-[#222222] flex-shrink-0">
			<div class="flex items-center justify-between mb-3">
				<h2 class="text-[13px] font-semibold text-[#f5f5f5]">
					Detected cuts
				</h2>
				<span
					class="text-[10px] text-[#6b7280] bg-[#1a1a1a] px-2 py-[3px] rounded-full border border-[#222222]"
				>
					47 cuts &nbsp;·&nbsp; 2m 14s saved
				</span>
			</div>

			<div class="flex flex-wrap gap-1.5">
				{#each filters as f}
					<button
						onclick={() => (activeFilter = f.id)}
						class="flex items-center gap-1.5 px-2 py-[5px] rounded-[5px] text-[11px] font-medium transition-colors
							{activeFilter === f.id
							? 'bg-[#1a1a1a] text-[#f5f5f5] border border-[#333333]'
							: 'text-[#6b7280] hover:text-[#a1a1aa] border border-transparent'}"
					>
						{#if f.color}<span
								class="w-[6px] h-[6px] rounded-full flex-shrink-0"
								style="background:{f.color}"
							></span>{/if}
						{f.label}
						<span class="text-[#3f3f46] ml-0.5">{f.count}</span>
					</button>
				{/each}
			</div>
		</div>

		<div
			class="flex items-center justify-between px-4 py-[7px] border-b border-[#222222] flex-shrink-0"
		>
			<div class="flex items-center">
				<button
					onclick={() => (selected = new Set(clips.map((c) => c.id)))}
					class="text-[11px] text-[#6b7280] hover:text-[#f5f5f5] px-2 py-1 rounded transition-colors"
					>Select all</button
				>
				<span class="text-[#3f3f46] text-[11px]">·</span>
				<button
					onclick={() => (selected = new Set())}
					class="text-[11px] text-[#6b7280] hover:text-[#f5f5f5] px-2 py-1 rounded transition-colors"
					>Deselect</button
				>
			</div>
			<span class="text-[11px] text-[#3f3f46]"
				>{selected.size} selected</span
			>
		</div>

		<div
			class="flex-1 overflow-y-auto pb-[120px] [&::-webkit-scrollbar]:hidden"
			style="scrollbar-width:none"
		>
			{#each visibleClips as clip (clip.id)}
				<button
					class="w-full flex items-center gap-3 px-4 py-[10px] hover:bg-[#1a1a1a] group transition-colors text-left"
					onclick={() => {
						if (selected.has(clip.id)) selected.delete(clip.id);
						else selected.add(clip.id);
						selected = selected;
					}}
				>
					<div
						class="w-0.5 h-8 rounded-full flex-shrink-0"
						style="background:{clip.color}"
					></div>
					<div
						class="w-[14px] h-[14px] rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors
						{selected.has(clip.id)
							? 'bg-[#7c3aed] border-[#7c3aed]'
							: 'border-[#333333] bg-[#1a1a1a] group-hover:border-[#555555]'}"
					>
						{#if selected.has(clip.id)}
							<svg
								class="w-2.5 h-2.5 text-white"
								viewBox="0 0 10 10"
								fill="none"
							>
								<path
									d="M1.5 5l2.5 2.5 4.5-5"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center justify-between gap-1">
							<span
								class="text-[12px] text-[#f5f5f5] font-medium truncate"
								>{clip.label}</span
							>
							<span
								class="text-[10px] text-[#3f3f46] flex-shrink-0"
								>{clip.dur}</span
							>
						</div>
						<span class="text-[10px] text-[#6b7280] font-mono"
							>{clip.time}</span
						>
					</div>
					<div class="flex items-center gap-px flex-shrink-0">
						{#each Array(8) as _, bi}
							<div
								class="w-px rounded-full bg-[#2a2a2a] group-hover:bg-[#333333] transition-colors"
								style="height:{miniBarHeight(clip.id, bi)}px"
							></div>
						{/each}
					</div>
				</button>
			{/each}
		</div>

		<div
			class="px-4 py-3 border-t border-[#222222] bg-[#0a0a0a] flex-shrink-0"
		>
			<button
				class="w-full py-2 bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] active:scale-95 text-white text-[12px] font-semibold rounded-[6px] transition-all disabled:opacity-40 disabled:pointer-events-none"
				disabled={selected.size === 0}
			>
				Apply {selected.size} cut{selected.size !== 1 ? "s" : ""}
			</button>
		</div>
	</aside>

	<!-- ── Main content area ─────────────────────────────────────────── -->
	<main
		class="flex-1 bg-[#0a0a0a] flex flex-col overflow-hidden min-w-0 relative"
	>
		<VideoPreview {isProcessed} bind:naturalness />

		<!-- Dev toggle (remove before launch) -->
		<div class="absolute top-3 right-3 z-30">
			<button
				onclick={() => {
					isProcessed = !isProcessed;
					isProcessing = isProcessed ? false : true;
				}}
				class="text-[10px] text-[#3f3f46] hover:text-[#6b7280] bg-[#111111] border border-dashed border-[#222222] rounded px-2 py-1 transition-colors"
			>
				[dev] {isProcessed ? "→ processing" : "→ processed"}
			</button>
		</div>

		<!-- Waveform / timeline -->
		<div
			class="h-[84px] border-t border-[#222222] bg-[#111111] px-4 flex flex-col justify-center gap-1.5 flex-shrink-0 pb-[120px] overflow-hidden"
		>
			<span
				class="text-[9px] font-semibold text-[#3f3f46] tracking-widest uppercase"
				>Timeline</span
			>
			<div class="flex items-end gap-px h-8 relative">
				{#each waveBarHeights as h}
					<div
						class="flex-1 rounded-sm bg-[#2a2a2a]"
						style="height:{h}px"
					></div>
				{/each}
				<div
					class="absolute inset-y-0 bg-[#f9731622] border-x border-[#f97316] border-opacity-60"
					style="left:7.8%;width:0.9%"
				></div>
				<div
					class="absolute inset-y-0 bg-[#3b82f622] border-x border-[#3b82f6] border-opacity-60"
					style="left:13.5%;width:0.5%"
				></div>
				<div
					class="absolute inset-y-0 bg-[#f9731622] border-x border-[#f97316] border-opacity-60"
					style="left:21.8%;width:1.2%"
				></div>
				<div
					class="absolute inset-y-0 bg-[#a855f722] border-x border-[#a855f7] border-opacity-60"
					style="left:44.2%;width:1.6%"
				></div>
				<div
					class="absolute inset-y-0 w-px bg-[#7c3aed]"
					style="left:28.4%"
				>
					<div
						class="absolute -top-[3px] -translate-x-1/2 w-[7px] h-[7px] bg-[#7c3aed] rotate-45"
					></div>
				</div>
			</div>
			<div class="flex justify-between px-0.5">
				{#each ["0:00", "0:15", "0:30", "0:45", "1:00", "1:15", "1:30", "1:45", "2:00"] as t}
					<span class="text-[9px] text-[#3f3f46] font-mono">{t}</span>
				{/each}
			</div>
		</div>
	</main>
</div>
