<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	function humanizeSlotId(slotId: string): string {
		const num = slotId.replace(/^slot_/, "");
		return `Slot ${num}`;
	}
</script>

{#if editor.swappableBeatGroups.length > 0}
	<div class="flex flex-col gap-3 px-4 py-4">
		<div class="flex items-start justify-between gap-3">
			<div class="space-y-1">
				<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
					Slot Swaps
				</span>
				<p class="text-[12px] leading-[1.5] text-snip-text-secondary">
					Choose which variant to keep for each semantic slot. The clip strip below mirrors the active mix.
				</p>
			</div>

			<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[3px] font-mono text-[11px] text-snip-text-secondary">
				{editor.swappableBeatCount}
			</span>
		</div>

		<div class="flex flex-col gap-3">
			{#each editor.swappableBeatGroups as group (group.slotId)}
				{@const selectedId = editor.selectedBeatVariantIds[group.slotId] ?? group.variants[0]?.variantId}
				{@const selectedVariant = group.variants.find((variant) => variant.variantId === selectedId) ?? group.variants[0]}

				<div class="rounded-xl border border-snip-border bg-snip-surface-elevated p-3">
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="outline" class="border-snip-border bg-snip-surface font-mono text-snip-text-primary">
							{humanizeSlotId(group.slotId)}
						</Badge>
						<span class="text-[11px] text-snip-text-muted">
							{group.variants.length} variant options
						</span>
						{#if selectedVariant}
							<span class="text-[11px] text-snip-text-secondary">
								Using {selectedVariant.label}
							</span>
						{/if}
					</div>

					<div class="mt-3 flex flex-wrap gap-2">
						{#each group.variants as variant (variant.id)}
							<button
								type="button"
								class={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/70 hover:text-white ${
									selectedId === variant.variantId
										? "border-primary bg-primary/12 text-white"
										: "border-snip-border bg-snip-surface text-snip-text-secondary"
								}`}
								onclick={() => editor.selectSlotVariant(group.slotId, variant.variantId)}
							>
								<span>{variant.label}</span>
								<span class="ml-2 font-mono text-[10px] opacity-75">
									{editor.formatSegmentDuration(variant.durationMs)}
								</span>
							</button>
						{/each}
					</div>

					{#if selectedVariant}
						<p class="mt-3 text-[11px] leading-[1.55] text-snip-text-secondary">
							{selectedVariant.previewText}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
