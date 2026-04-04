<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Scissors, FileVideo } from '@lucide/svelte';
	import { isProcessed } from '$lib/stores/snip';

	let { children } = $props();
	let activeTab = $state<'edit' | 'export' | 'settings'>('edit');

	const tabs = ['edit', 'export', 'settings'] as const;

	// ── Processing-state clip strip ──────────────────────────────────
	const rawSegments = [
		{ type: 'keep',    width: '6.8%' },
		{ type: 'filler',  width: '0.8%' },
		{ type: 'keep',    width: '5.2%' },
		{ type: 'pause',   width: '0.5%' },
		{ type: 'keep',    width: '7.6%' },
		{ type: 'filler',  width: '1.1%' },
		{ type: 'keep',    width: '5.8%' },
		{ type: 'mouth',   width: '0.3%' },
		{ type: 'keep',    width: '8.9%' },
		{ type: 'long',    width: '1.6%' },
		{ type: 'keep',    width: '6.4%' },
		{ type: 'filler',  width: '0.9%' },
		{ type: 'keep',    width: '5.6%' },
		{ type: 'pause',   width: '0.6%' },
		{ type: 'keep',    width: '8.1%' },
		{ type: 'filler',  width: '0.7%' },
		{ type: 'keep',    width: '5.0%' },
		{ type: 'mouth',   width: '0.4%' },
		{ type: 'keep',    width: '8.7%' },
		{ type: 'restart', width: '1.0%' },
		{ type: 'keep',    width: '6.9%' },
		{ type: 'filler',  width: '0.5%' },
		{ type: 'keep',    width: 'flex' },
	] as { type: string; width: string }[];

	// ── Processed-state clip strip (labeled cuts) ───────────────────
	const processedSegments = [
		{ type: 'keep',    width: '5.5%',  label: null          },
		{ type: 'filler',  width: '2.8%',  label: 'um ×2'       },
		{ type: 'keep',    width: '5.8%',  label: null          },
		{ type: 'pause',   width: '1.4%',  label: 'dead air'    },
		{ type: 'keep',    width: '7.2%',  label: null          },
		{ type: 'filler',  width: '3.2%',  label: 'you know'    },
		{ type: 'keep',    width: '5.4%',  label: null          },
		{ type: 'restart', width: '2.2%',  label: 'restart'     },
		{ type: 'keep',    width: '8.3%',  label: null          },
		{ type: 'filler',  width: '2.8%',  label: 'uh ×3'       },
		{ type: 'keep',    width: '6.1%',  label: null          },
		{ type: 'mouth',   width: '0.9%',  label: null          },
		{ type: 'keep',    width: '5.8%',  label: null          },
		{ type: 'long',    width: '3.0%',  label: 'long pause'  },
		{ type: 'keep',    width: '6.6%',  label: null          },
		{ type: 'filler',  width: '1.8%',  label: 'like'        },
		{ type: 'keep',    width: 'flex',  label: null          },
	] as { type: string; width: string; label: string | null }[];

	const segColor: Record<string, string> = {
		filler:  '#f97316',
		pause:   '#3b82f6',
		mouth:   '#eab308',
		long:    '#a855f7',
		restart: '#22c55e',
		keep:    '#1a1a1a',
	};

	// Legend — used in both states (different positions)
	const legend = [
		['#f97316', 'filler'],
		['#3b82f6', 'pause'],
		['#22c55e', 'restart'],
		['#eab308', 'mouth sounds'],
		['#a855f7', 'long pause'],
	] as [string, string][];
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex flex-col h-screen overflow-hidden bg-[#0a0a0a] font-sans">

	<!-- ── Navbar ──────────────────────────────────────────────────────── -->
	<header class="h-[52px] flex-shrink-0 bg-[#0a0a0a] border-b border-[#222222] flex items-center gap-2 px-3">

		<div class="w-8 h-8 rounded-[6px] bg-[#7c3aed] flex items-center justify-center flex-shrink-0">
			<Scissors class="w-[14px] h-[14px] text-white" strokeWidth={2.2} />
		</div>

		<div class="flex items-center gap-0.5 ml-1 p-[3px] bg-[#111111] rounded-[8px] border border-[#222222]">
			{#each tabs as tab}
				<button
					onclick={() => (activeTab = tab)}
					class="px-3 py-[5px] text-[11px] font-medium rounded-[5px] transition-colors capitalize
						{activeTab === tab ? 'bg-[#1a1a1a] text-[#f5f5f5]' : 'text-[#6b7280] hover:text-[#a1a1aa]'}"
				>
					{tab}
				</button>
			{/each}
		</div>

		<div class="flex-1"></div>

		<div class="flex items-center gap-1.5 px-2.5 py-[5px] bg-[#111111] border border-[#222222] rounded-[6px]">
			<FileVideo class="w-3 h-3 text-[#3f3f46]" strokeWidth={1.8} />
			<span class="text-[11px] text-[#6b7280] font-medium">podcast_ep42_raw.mp4</span>
		</div>

		<div class="flex items-center gap-1.5 px-2">
			<span
				class="w-[7px] h-[7px] rounded-full flex-shrink-0 transition-colors
					{$isProcessed ? 'bg-[#22c55e]' : 'bg-[#7c3aed]'}"
				style="{$isProcessed ? 'box-shadow:0 0 6px #22c55e90' : 'box-shadow:0 0 6px #7c3aed90'}"
			></span>
			<span class="text-[11px] text-[#6b7280]">{$isProcessed ? 'Ready' : 'Analysing'}</span>
		</div>

		<button
			class="flex items-center gap-1.5 px-3 py-[7px] bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] text-white text-[11px] font-semibold rounded-[6px] transition-colors select-none
				{!$isProcessed ? 'opacity-40 pointer-events-none' : ''}"
		>
			Export clean <span class="opacity-75">→</span>
		</button>

	</header>

	<!-- ── Page content ────────────────────────────────────────────────── -->
	<div class="flex-1 overflow-hidden">
		{@render children()}
	</div>

</div>

<!-- ── Bottom clip strip ────────────────────────────────────────────────── -->
<div class="fixed bottom-0 inset-x-0 h-[120px] bg-[#111111] border-t border-[#222222] z-40 flex flex-col">

	{#if $isProcessed}
		<!-- ── Processed header: legend left, stats right ─────────────── -->
		<div class="flex items-center justify-between px-4 h-8 border-b border-[#222222] flex-shrink-0">
			<div class="flex items-center gap-2.5">
				{#each legend as [color, label]}
					<div class="flex items-center gap-1">
						<div class="w-2 h-2 rounded-[2px]" style="background:{color}"></div>
						<span class="text-[10px] text-[#6b7280]">{label}</span>
					</div>
				{/each}
			</div>
			<span class="text-[11px] text-[#6b7280]">
				207 cuts applied &nbsp;·&nbsp; 38:06 runtime
			</span>
		</div>
	{:else}
		<!-- ── Processing header: label left, stats + legend right ────── -->
		<div class="flex items-center justify-between px-4 h-8 border-b border-[#222222] flex-shrink-0">
			<span class="text-[10px] font-semibold text-[#3f3f46] tracking-widest uppercase">
				Clip strip
			</span>
			<div class="flex items-center gap-4">
				<span class="text-[11px] text-[#6b7280]">
					1:04:18 total &nbsp;·&nbsp; 1:02:04 clean output
				</span>
				<div class="flex items-center gap-2.5">
					{#each legend as [color, label]}
						<div class="flex items-center gap-1">
							<div class="w-2 h-2 rounded-[2px]" style="background:{color}"></div>
							<span class="text-[10px] text-[#6b7280]">{label}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- ── Timeline ─────────────────────────────────────────────────── -->
	<div class="flex items-center px-4 flex-1 gap-[2px] overflow-hidden relative">
		{#if $isProcessed}
			{#each processedSegments as seg}
				<div
					class="clip-seg flex-shrink-0 flex items-center justify-center overflow-hidden"
					style="
						{seg.width === 'flex' ? 'flex:1;' : `width:${seg.width};`}
						height: {seg.type === 'keep' ? '50px' : '34px'};
						background: {segColor[seg.type]};
						opacity: {seg.type === 'keep' ? '0.35' : '1'};
						border-radius: 3px 3px 0 0;
						{seg.type !== 'keep' ? `border: 1px solid ${segColor[seg.type]};` : ''}
					"
				>
					{#if seg.label}
						<span class="text-[8px] text-white font-semibold whitespace-nowrap overflow-hidden px-1 leading-none opacity-90">
							{seg.label}
						</span>
					{/if}
				</div>
			{/each}
		{:else}
			{#each rawSegments as seg}
				<div
					class="clip-seg flex-shrink-0"
					style="
						{seg.width === 'flex' ? 'flex:1;' : `width:${seg.width};`}
						height: {seg.type === 'keep' ? '50px' : '26px'};
						background: {segColor[seg.type]};
						opacity: {seg.type === 'keep' ? '0.35' : '1'};
						border-radius: 3px 3px 0 0;
					"
				></div>
			{/each}
		{/if}

		<!-- Edge fade overlays -->
		<div class="absolute left-0 inset-y-0 w-8 pointer-events-none z-10" style="background:linear-gradient(to right,#111111,transparent)"></div>
		<div class="absolute right-0 inset-y-0 w-8 pointer-events-none z-10" style="background:linear-gradient(to left,#111111,transparent)"></div>
	</div>

</div>

<style>
	.clip-seg { transition: filter 0.15s ease; }
	.clip-seg:hover { filter: brightness(1.15); }
</style>
