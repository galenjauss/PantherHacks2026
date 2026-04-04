<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	let { onSeekSlot }: { onSeekSlot?: (slotId: string, startMs: number) => void } = $props();

	const slotGroups = $derived(editor.slotGroups);
	const speechChunks = $derived(editor.speechChunks);

	function selectedVariantId(slotId: string, variants: { variantId: string }[]): string {
		return editor.selectedSlotVariantIds[slotId] ?? variants[0]?.variantId ?? "";
	}

	function humanizeSlotId(slotId: string): string {
		const num = slotId.replace(/^slot_/, "");
		return `Slot ${num}`;
	}

	function chunkSummary(chunkCount: number): string {
		if (chunkCount <= 0) return "No pause chunks";
		if (chunkCount === 1) return "Single pause chunk";
		return `Stitched from ${chunkCount} pause chunks`;
	}
</script>

<div class="flex flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
	{#if slotGroups.length === 0}
		<div class="px-4 py-6 text-center">
			<p class="text-[12px] text-snip-text-muted">
				No semantic slots detected yet. Upload and process a video to see the structure.
			</p>
		</div>
	{:else}
		<div class="px-4 pt-4 pb-2">
			<p class="text-[12px] leading-[1.5] text-snip-text-secondary">
				{slotGroups.length} script slot{slotGroups.length !== 1 ? "s" : ""} from
				<span class="text-snip-text-primary font-medium"> {speechChunks.length}</span>
				pause chunk{speechChunks.length !== 1 ? "s" : ""} at the current threshold.
				{#if editor.swappableSlotCount > 0}
					<span class="text-primary font-medium">{editor.swappableSlotCount}</span> with alternate variants.
				{/if}
			</p>
		</div>

		<div class="flex flex-col">
			{#each slotGroups as group, groupIndex (group.slotId)}
				{@const selId = selectedVariantId(group.slotId, group.variants)}
				{@const selVariant = group.variants.find((v) => v.variantId === selId) ?? group.variants[0]}
				{@const hasAlts = group.variants.length > 1}

				<div
					role="button"
					tabindex="0"
					class="group w-full text-left px-4 py-3 transition-colors hover:bg-snip-surface-elevated border-b border-[#1a1a1a] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					onclick={() => {
						if (selVariant && onSeekSlot) {
							onSeekSlot(group.slotId, selVariant.start);
						}
					}}
					onkeydown={(e: KeyboardEvent) => {
						if (e.key !== "Enter" && e.key !== " ") return;
						e.preventDefault();
						if (selVariant && onSeekSlot) {
							onSeekSlot(group.slotId, selVariant.start);
						}
					}}
				>
					<div class="flex items-center gap-2 mb-1.5">
						<span class="flex items-center justify-center w-5 h-5 rounded-md bg-snip-surface-elevated text-[10px] font-bold text-snip-text-muted tabular-nums flex-shrink-0">
							{groupIndex + 1}
						</span>
						<Badge variant="outline" class="border-snip-border bg-snip-surface font-mono text-[10px] text-snip-text-muted px-1.5 py-0">
							{group.lineLabel}
						</Badge>
						<Badge variant="outline" class="border-snip-border bg-snip-surface font-mono text-[10px] text-snip-text-muted px-1.5 py-0">
							{humanizeSlotId(group.slotId)}
						</Badge>
						{#if hasAlts}
							<span class="ml-auto text-[10px] text-primary font-medium">
								{group.variants.length} variants
							</span>
						{/if}
					</div>

					{#if selVariant}
						<p class="text-[12px] leading-[1.6] text-snip-text-primary line-clamp-2 mb-2">
							{selVariant.previewText}
						</p>

						<div class="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-snip-text-muted">
							<span>{chunkSummary(selVariant.chunkCount)}</span>
							{#if selVariant.internalPauseDurationMs > 0}
								<span>&middot;</span>
								<span>{editor.formatSegmentDuration(selVariant.internalPauseDurationMs)} internal pauses</span>
							{/if}
						</div>
					{/if}

					{#if hasAlts}
						<div
							class="flex flex-wrap gap-1.5"
							role="group"
							aria-label="Variant selection for {humanizeSlotId(group.slotId)}"
						>
							{#each group.variants as variant (variant.id)}
								<button
								type="button"
								class="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors
										{selId === variant.variantId
										? 'border-primary bg-primary/12 text-white'
										: 'border-snip-border bg-snip-surface text-snip-text-secondary hover:border-primary/50 hover:text-snip-text-primary'}"
									onclick={(e: MouseEvent) => { e.stopPropagation(); editor.selectSlotVariant(group.slotId, variant.variantId); }}
									title={`${variant.label} · ${chunkSummary(variant.chunkCount)}`}
								>
									{variant.label}
									<span class="ml-1 font-mono text-[9px] opacity-60">
										{editor.formatSegmentDuration(variant.durationMs)}
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="px-4 py-3 border-t border-snip-border flex-shrink-0">
			<p class="text-[11px] text-snip-text-muted">
				Clean runtime: <span class="text-snip-text-secondary font-mono">{editor.formatDuration(editor.cleanDurationMs)}</span>
				&middot; {editor.selectedCutCount} cuts remove <span class="text-primary font-medium">{editor.formatDuration(editor.selectedCutDurationMs)}</span>
				&middot; {editor.stitchedVariantCount} stitched selection{editor.stitchedVariantCount !== 1 ? "s" : ""}
			</p>
		</div>
	{/if}
</div>
