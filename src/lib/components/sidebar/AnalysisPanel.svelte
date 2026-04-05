<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
</script>

<div class="flex flex-col gap-2 px-4 py-3">
	<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
		Preliminary Analysis
	</span>

	{#if editor.analysisStats.some((item) => item.count > 0)}
		<div class="flex flex-col gap-2.5">
			{#each editor.analysisStats as stat}
				<div class="flex items-center gap-2.5">
					<span class="size-[6px] shrink-0 rounded-full" style={`background:${stat.color}`}></span>
					<span class="w-[90px] shrink-0 text-[12px] leading-none text-snip-text-secondary">
						{stat.label}
					</span>
					<div class="h-1 flex-1 overflow-hidden rounded-full bg-[#222222]">
						<div class="h-full rounded-full" style={`width:${stat.fill}%;background:${stat.color};`}></div>
					</div>
					<span class="w-8 shrink-0 text-right font-mono text-[13px] font-medium tabular-nums text-white">
						{stat.count}
					</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex flex-col gap-2.5">
			{#each Array.from({ length: 3 }) as _, index}
				<div class="flex items-center gap-2.5">
					<Skeleton class={`size-[6px] rounded-full bg-white/${index % 2 === 0 ? "20" : "10"}`} />
					<Skeleton class="h-3 w-[90px] rounded bg-white/10" />
					<Skeleton class="h-1 flex-1 rounded bg-white/10" />
					<Skeleton class="h-3 w-8 rounded bg-white/10" />
				</div>
			{/each}
		</div>
	{/if}

	<div class="mt-1 flex flex-col gap-2 rounded-lg border border-snip-border bg-snip-surface-elevated p-4">
		<span class="text-[10px] font-bold uppercase leading-none tracking-[0.25em] text-primary">
			Recommendation
		</span>
		{#if editor.isBusy}
			<div class="space-y-2">
				<Skeleton class="h-3 w-full rounded bg-white/12" />
				<Skeleton class="h-3 w-4/5 rounded bg-white/10" />
			</div>
		{:else}
			<p class="text-[12px] leading-[1.6] text-snip-text-secondary">{editor.recommendationText}</p>
		{/if}
	</div>
</div>
