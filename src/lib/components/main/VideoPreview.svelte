<script lang="ts">
	import { Play } from '@lucide/svelte';
	import { Slider } from '$lib/components/ui/slider';

	let {
		isProcessed  = false,
		naturalness  = $bindable(3),
	}: {
		isProcessed?: boolean;
		naturalness?: number;
	} = $props();

	let baActive = $state(false);
</script>

<div class="flex flex-col flex-1 min-h-0 bg-[#0a0a0a]">

	<!-- ── Video stage ──────────────────────────────────────────────── -->
	<div class="flex-1 flex items-center justify-center p-8 min-h-0">
		<div class="relative w-full max-w-[700px]">

			<div class="aspect-video w-full bg-[#111111] rounded-sm border border-[#1e1e1e] flex items-center justify-center overflow-hidden relative">

				{#if isProcessed}
					<!-- ── Processed: silhouette + badge ──────────────── -->
					<div class="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 bg-[#0f0f0f] border border-[#2a2a2a] rounded-full z-10 whitespace-nowrap">
						<svg class="w-[10px] h-[10px] text-[#22c55e] flex-shrink-0" viewBox="0 0 10 10" fill="none">
							<path d="M1.5 5.5l2 2 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span class="text-[10px] text-[#6b7280] font-medium">clean preview</span>
					</div>
					<svg width="72" height="90" viewBox="0 0 72 90" fill="none" aria-hidden="true">
						<circle cx="36" cy="22" r="14" fill="#1e1e2a"/>
						<rect x="8" y="44" width="56" height="44" rx="10" fill="#1e1e2a"/>
					</svg>

				{:else}
					<!-- ── Processing: spinner ─────────────────────────── -->
					<div class="flex flex-col items-center gap-3">
						<div class="spinner w-12 h-12 rounded-full border-2 border-[#7c3aed] border-t-transparent"></div>
						<span class="text-[13px] text-[#6b7280]">analysing transcript…</span>
					</div>
				{/if}

			</div>

			<div class="absolute bottom-2.5 right-3 text-[11px] font-mono text-[#3f3f46] pointer-events-none">
				{isProcessed ? '00:00 / 38:06' : '00:00 / 42:18'}
			</div>

		</div>
	</div>

	<!-- ── Controls bar ──────────────────────────────────────────────── -->
	<div class="h-[44px] flex-shrink-0 border-t border-[#222222] flex items-center justify-between px-4 gap-4">

		<!-- Left: play + timecode -->
		<div class="flex items-center gap-2.5">
			<button class="text-[#6b7280] hover:text-[#f5f5f5] transition-colors flex-shrink-0" aria-label="Play">
				<Play class="w-4 h-4" strokeWidth={1.8} />
			</button>
			<span class="text-[13px] font-mono text-[#6b7280] tabular-nums">
				{isProcessed ? '00:00 / 38:06' : '00:00 / 42:18'}
			</span>
		</div>

		{#if isProcessed}
			<!-- ── Processed right cluster ──────────────────────────── -->
			<div class="flex items-center gap-3">
				<span class="text-[13px] font-medium text-[#f5f5f5]">38:06 clean</span>
				<span class="text-[11px] text-[#3f3f46] line-through decoration-[#3f3f46]">was 42:18</span>
				<button
					onclick={() => (baActive = !baActive)}
					class="text-[11px] font-medium border rounded-full px-2.5 py-[3px] transition-colors flex-shrink-0
						{baActive ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'text-[#6b7280] border-[#333333] hover:border-[#7c3aed] hover:text-[#f5f5f5]'}"
				>
					{baActive ? 'after' : 'B/A'}
				</button>
			</div>

		{:else}
			<!-- ── Processing right cluster ─────────────────────────── -->
			<div class="flex items-center gap-3">
				<span class="text-[11px] text-[#3f3f46] flex-shrink-0">naturalness</span>
				<div class="w-28 slider-snip">
					<Slider type="single" bind:value={naturalness} min={1} max={5} step={1} />
				</div>
				<span class="text-[13px] font-medium text-[#f5f5f5] w-3 text-center tabular-nums flex-shrink-0">
					{naturalness}
				</span>
				<button class="text-[11px] font-medium text-[#6b7280] border border-[#333333] rounded-full px-2.5 py-[3px] hover:border-[#7c3aed] hover:text-[#f5f5f5] transition-colors flex-shrink-0">
					B/A
				</button>
			</div>
		{/if}

	</div>

</div>

<style>
	.spinner { animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.slider-snip :global([data-slot="slider-track"])      { background-color:#222222; height:4px; }
	.slider-snip :global([data-slot="slider-range"])      { background-color:#7c3aed; }
	.slider-snip :global([data-slot="slider-thumb"])      { width:14px; height:14px; background-color:#7c3aed; border-color:#7c3aed; box-shadow:0 0 0 2px #0a0a0a; }
	.slider-snip :global([data-slot="slider-thumb"]:hover),
	.slider-snip :global([data-slot="slider-thumb"]:focus-visible) { box-shadow:0 0 0 2px #0a0a0a, 0 0 0 4px #7c3aed55; }
</style>
