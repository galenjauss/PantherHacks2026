<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	let { onSeekBeat }: { onSeekBeat?: (beatId: string, startMs: number) => void } = $props();

	const beatGroups = $derived(editor.beatGroups);

	function selectedVariantId(beatId: string, variants: { id: string }[]): string {
		return editor.selectedBeatVariantIds[beatId] ?? variants[0]?.id ?? "";
	}

	function humanizeBeatId(beatId: string): string {
		const num = beatId.replace(/^beat_/, "");
		return `Beat ${num}`;
	}
</script>

<div class="flex flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
	{#if beatGroups.length === 0}
		<div class="px-4 py-6 text-center">
			<p class="text-[12px] text-snip-text-muted">
				No beats detected yet. Upload and process a video to see the script structure.
			</p>
		</div>
	{:else}
		<div class="px-4 pt-4 pb-2">
			<p class="text-[12px] leading-[1.5] text-snip-text-secondary">
				{beatGroups.length} beat{beatGroups.length !== 1 ? "s" : ""} detected.
				{#if editor.swappableBeatCount > 0}
					<span class="text-primary font-medium">{editor.swappableBeatCount}</span> with alternate takes.
				{/if}
			</p>
		</div>

		<div class="flex flex-col">
			{#each beatGroups as group, groupIndex (group.beatId)}
				{@const selId = selectedVariantId(group.beatId, group.variants)}
				{@const selVariant = group.variants.find((v) => v.id === selId) ?? group.variants[0]}
				{@const hasAlts = group.variants.length > 1}

				<div
					role="button"
					tabindex="0"
					class="group w-full text-left px-4 py-3 transition-colors hover:bg-snip-surface-elevated border-b border-[#1a1a1a] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					onclick={() => {
						if (selVariant && onSeekBeat) {
							onSeekBeat(group.beatId, selVariant.start);
						}
					}}
					onkeydown={(e: KeyboardEvent) => {
						if (e.key !== "Enter" && e.key !== " ") return;
						e.preventDefault();
						if (selVariant && onSeekBeat) {
							onSeekBeat(group.beatId, selVariant.start);
						}
					}}
				>
					<!-- Beat header -->
					<div class="flex items-center gap-2 mb-1.5">
						<span class="flex items-center justify-center w-5 h-5 rounded-md bg-snip-surface-elevated text-[10px] font-bold text-snip-text-muted tabular-nums flex-shrink-0">
							{groupIndex + 1}
						</span>
						<Badge variant="outline" class="border-snip-border bg-snip-surface font-mono text-[10px] text-snip-text-muted px-1.5 py-0">
							{humanizeBeatId(group.beatId)}
						</Badge>
						{#if hasAlts}
							<span class="ml-auto text-[10px] text-primary font-medium">
								{group.variants.length} takes
							</span>
						{/if}
					</div>

					<!-- Selected take preview text -->
					{#if selVariant}
						<p class="text-[12px] leading-[1.6] text-snip-text-primary line-clamp-2 mb-2">
							{selVariant.previewText}
						</p>
					{/if}

					<!-- Take pills (only if multiple variants) -->
					{#if hasAlts}
						<div
							class="flex flex-wrap gap-1.5"
							role="group"
							aria-label="Take selection for {humanizeBeatId(group.beatId)}"
						>
							{#each group.variants as variant (variant.id)}
								<button
									type="button"
									class="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors
										{selId === variant.id
										? 'border-primary bg-primary/12 text-white'
										: 'border-snip-border bg-snip-surface text-snip-text-secondary hover:border-primary/50 hover:text-snip-text-primary'}"
									onclick={(e: MouseEvent) => { e.stopPropagation(); editor.selectBeatVariant(group.beatId, variant.id); }}
								>
									{variant.label}
									<span class="ml-1 font-mono text-[9px] opacity-60">
										{editor.formatSegmentDuration(variant.durationMs)}
									</span>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Filler indicator -->
					{#if selVariant && selVariant.fillerCount > 0}
						<div class="mt-2 flex items-center gap-1.5">
							<span class="size-[5px] rounded-full bg-[#ef4444] flex-shrink-0"></span>
							<span class="text-[10px] text-snip-text-muted">
								{selVariant.fillerCount} filler{selVariant.fillerCount !== 1 ? "s" : ""} in this take
							</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>

	{/if}
</div>
