<script lang="ts">
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
	import type { EditedTimelineBlock } from "$lib/stores/video-editor.svelte";

	let {
		hoveredBeatId = $bindable(null),
		onSeekBeat,
	}: {
		hoveredBeatId?: string | null;
		onSeekBeat?: (beatId: string, startMs: number) => void;
	} = $props();

	const blocks = $derived(editor.editedTimelineBlocks);
	const cleanDuration = $derived(editor.formatDuration(editor.cleanDurationMs));
	const totalDuration = $derived(editor.formatDuration(editor.totalDurationMs));

	function handleClick(block: EditedTimelineBlock) {
		if (block.kind === "beat" && block.beatId && onSeekBeat) {
			onSeekBeat(block.beatId, block.startMs);
		}
	}
</script>

<div class="flex flex-col gap-2 select-none">
	<!-- Header -->
	<div class="flex items-center justify-between px-0.5">
		<span class="text-[10px] font-semibold uppercase tracking-[0.2em] text-snip-text-muted">
			Edited timeline
		</span>
		<span class="text-[10px] font-mono text-snip-text-secondary tabular-nums">
			{cleanDuration} / {totalDuration}
		</span>
	</div>

	<!-- Beat blocks row -->
	{#if blocks.length > 0}
		<div class="flex h-10 gap-[2px] rounded-md overflow-hidden">
			{#each blocks as block (block.id)}
				{#if block.kind === "beat"}
					{@const isHovered = hoveredBeatId === block.beatId}
					<button
						type="button"
						class="relative flex items-end overflow-hidden transition-all duration-150 group"
						style="
							width: {block.widthPct}%;
							background: {isHovered ? block.color : `${block.color}33`};
							border-bottom: 2px solid {block.color};
						"
						onmouseenter={() => { if (block.beatId) hoveredBeatId = block.beatId; }}
						onmouseleave={() => { hoveredBeatId = null; }}
						onclick={() => handleClick(block)}
						title="{block.humanLabel}: {block.label} ({editor.formatSegmentDuration(block.durationMs)})"
					>
						{#if block.widthPct > 8}
							<span
								class="absolute inset-0 flex items-center justify-center px-1 text-[9px] font-medium truncate transition-colors"
								style="color: {isHovered ? 'white' : block.color};"
							>
								{block.label}
							</span>
						{/if}

						{#if isHovered}
							<div
								class="absolute inset-0 pointer-events-none"
								style="background: linear-gradient(180deg, {block.color}22 0%, {block.color}44 100%);"
							></div>
						{/if}
					</button>
				{:else if block.kind === "cut"}
					<div
						class="relative flex items-center justify-center overflow-hidden"
						style="width: {block.widthPct}%; background: #ef444418; border-bottom: 2px solid #ef444466;"
						title="{block.label} ({editor.formatSegmentDuration(block.durationMs)})"
					>
						{#if block.widthPct > 6}
							<span class="text-[8px] font-medium text-[#ef4444] opacity-70 truncate px-0.5">
								{block.label}
							</span>
						{:else}
							<div class="w-px h-3 bg-[#ef4444] opacity-40"></div>
						{/if}
					</div>
				{:else}
					<!-- gap -->
					<div
						class="relative overflow-hidden"
						style="width: {block.widthPct}%; background: #1a1a1a; border-bottom: 2px solid #2a2a2a;"
					></div>
				{/if}
			{/each}
		</div>

		<!-- Labels underneath -->
		<div class="flex gap-[2px]">
			{#each blocks as block (block.id)}
				<div
					class="text-center overflow-hidden"
					style="width: {block.widthPct}%;"
				>
					{#if block.kind === "beat" && block.beatId && block.widthPct > 5}
						<span
							class="text-[8px] font-mono transition-colors"
							style="color: {hoveredBeatId === block.beatId ? block.color : '#3f3f46'};"
						>
							{block.humanLabel}
						</span>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="h-10 rounded-md border border-dashed border-snip-border flex items-center justify-center">
			<span class="text-[10px] text-snip-text-muted">No beats to display</span>
		</div>
	{/if}
</div>
