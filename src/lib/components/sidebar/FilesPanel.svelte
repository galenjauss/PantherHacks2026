<script lang="ts">
	import { Film, Plus } from '@lucide/svelte';

	let { isProcessing = true }: { isProcessing?: boolean } = $props();

	const files = [
		{ id: 1, name: 'podcast_ep12_raw.mp4', size: '1.2 GB', duration: '42:18' },
		{ id: 2, name: 'interview_draft.mp4',  size: '680 MB', duration: '28:44' },
	];
</script>

<div class="flex flex-col gap-2 p-4">

	<span class="text-[10px] font-semibold text-[#3f3f46] tracking-widest uppercase">Files</span>

	<div class="flex flex-col gap-1.5">
		{#each files as file (file.id)}
			<div class="flex items-center gap-3 bg-[#1a1a1a] border border-[#222222] rounded-lg px-3 h-14 flex-shrink-0">
				<div class="w-8 h-8 rounded-sm bg-[#1f1f1f] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
					<Film class="w-[14px] h-[14px] text-[#3f3f46]" strokeWidth={1.5} />
				</div>

				<div class="flex-1 min-w-0">
					<p class="text-[13px] font-medium text-[#f5f5f5] truncate leading-5">{file.name}</p>
					<p class="text-[11px] text-[#6b7280] leading-4 font-mono">{file.size} · {file.duration}</p>
				</div>

				{#if file.id === 1 && isProcessing}
					<!-- Processing badge -->
					<div class="flex items-center gap-1.5 px-2.5 py-[3px] bg-[#7c3aed] rounded-full flex-shrink-0">
						<span class="pulse-dot w-[5px] h-[5px] rounded-full bg-white/80 flex-shrink-0"></span>
						<span class="text-[11px] font-medium text-white">processing</span>
					</div>
				{:else}
					<!-- Done badge -->
					<div class="flex items-center gap-1 px-2.5 py-[3px] bg-[#22c55e]/15 border border-[#22c55e]/25 rounded-full flex-shrink-0">
						<svg class="w-[9px] h-[9px] text-[#22c55e] flex-shrink-0" viewBox="0 0 10 10" fill="none">
							<path d="M1.5 5.5l2 2 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span class="text-[11px] font-medium text-[#22c55e]">done</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<button class="flex flex-col items-center gap-1 border border-dashed border-[#2a2a2a] hover:border-[#3d3d3d] rounded-lg px-4 py-[10px] transition-colors w-full">
		<div class="flex items-center gap-2">
			<Plus class="w-[14px] h-[14px] text-[#6b7280]" strokeWidth={2} />
			<span class="text-[12px] text-[#6b7280]">
				add file <span class="text-[#7c3aed] underline underline-offset-2 decoration-[#7c3aed]/50">or browse</span>
			</span>
		</div>
		<span class="text-[10px] text-[#3f3f46]">mp4, mov, mkv, wav</span>
	</button>

</div>

<style>
	.pulse-dot { animation: dot-scale-pulse 1.5s ease-in-out infinite; }
	@keyframes dot-scale-pulse {
		0%,100% { transform: scale(1);   opacity: 1;   }
		50%      { transform: scale(1.4); opacity: 0.4; }
	}
</style>
