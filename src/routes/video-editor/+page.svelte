<script lang="ts">
	import { fade } from "svelte/transition";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import FilesPanel from "$lib/components/sidebar/FilesPanel.svelte";
	import SnipAIPanel from "$lib/components/sidebar/SnipAIPanel.svelte";
	import AnalysisPanel from "$lib/components/sidebar/AnalysisPanel.svelte";
	import CutSettingsPanel from "$lib/components/sidebar/CutSettingsPanel.svelte";
	import VideoPreview from "$lib/components/main/VideoPreview.svelte";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	const filters = [
		{ id: "all", label: "All" },
		{ id: "filler_words", label: "Filler" },
		{ id: "dead_space", label: "Pause" },
		{ id: "retake", label: "Retake" }
	] as const;

	$effect(() => {
		void editor.maybeStartProcessing();
	});

	$effect(() => {
		const signature = editor.selectionSignature;
		editor.syncSelectionWithSegments(signature);
	});

	$effect(() => {
		const signature = editor.syncSignature;
		void editor.maybeSyncAutocutJob(signature);
	});
</script>

<div class="flex h-full">
	<aside class="flex w-[368px] flex-shrink-0 flex-col overflow-hidden border-r border-snip-border bg-snip-surface">
		<FilesPanel />

		<div class="border-t border-snip-border"></div>

		{#if editor.isBusy}
			<div transition:fade={{ duration: 180 }} class="flex flex-col">
				<SnipAIPanel />
				<div class="border-t border-snip-border"></div>
				<AnalysisPanel />
			</div>
		{:else}
			<div transition:fade={{ duration: 180 }} class="flex flex-col">
				<CutSettingsPanel />
			</div>
		{/if}

		<div class="border-t border-snip-border"></div>

		<div class="border-b border-snip-border px-4 pb-3 pt-4">
			<div class="mb-3 flex items-center justify-between gap-3">
				<h2 class="text-[13px] font-semibold text-white">Detected cuts</h2>
				<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[3px] text-[10px] text-snip-text-secondary">
					{editor.selectedCutCount} selected · {editor.formatDuration(editor.selectedCutDurationMs)}
				</span>
			</div>

			<div class="flex flex-wrap gap-1.5">
				{#each filters as filter (filter.id)}
					<button
						type="button"
						onclick={() => (editor.activeFilter = filter.id)}
						class={`flex items-center gap-1.5 rounded-[6px] border px-2 py-[5px] text-[11px] font-medium transition-colors ${
							editor.activeFilter === filter.id
								? "border-[#333333] bg-snip-surface-elevated text-white"
								: "border-transparent text-snip-text-secondary hover:text-white"
						}`}
					>
						{filter.label}
						<span class="text-snip-text-muted">{editor.cutCounts[filter.id]}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="flex items-center justify-between border-b border-snip-border px-4 py-[7px]">
			<div class="flex items-center">
				<button
					type="button"
					onclick={() => editor.selectAllCuts()}
					class="rounded px-2 py-1 text-[11px] text-snip-text-secondary transition-colors hover:text-white"
				>
					Select all
				</button>
				<span class="text-[11px] text-snip-text-muted">·</span>
				<button
					type="button"
					onclick={() => editor.clearSelectedCuts()}
					class="rounded px-2 py-1 text-[11px] text-snip-text-secondary transition-colors hover:text-white"
				>
					Deselect
				</button>
			</div>
			<span class="text-[11px] text-snip-text-muted">{editor.selectedCutIds.length} selected</span>
		</div>

		<div
			class="flex-1 overflow-y-auto pb-[120px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{#if editor.filteredCutSegments.length > 0}
				{#each editor.filteredCutSegments as segment (segment.id)}
					<button
						type="button"
						class="group flex w-full items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-snip-surface-elevated"
						onclick={() => editor.toggleCutSelection(segment.id)}
					>
						<div class="h-8 w-0.5 flex-shrink-0 rounded-full" style={`background:${segment.color}`}></div>
						<div
							class={`flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
								editor.selectedCutIds.includes(segment.id)
									? "border-primary bg-primary"
									: "border-[#333333] bg-snip-surface group-hover:border-[#555555]"
							}`}
						>
							{#if editor.selectedCutIds.includes(segment.id)}
								<svg class="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
									<path
										d="M1.5 5l2.5 2.5 4.5-5"
										stroke="currentColor"
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="1.5"
									/>
								</svg>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center justify-between gap-2">
								<span class="truncate text-[12px] font-medium text-white">{segment.label}</span>
								<span class="flex-shrink-0 text-[10px] text-snip-text-muted">
									{editor.formatSegmentDuration(segment.durationMs)}
								</span>
							</div>
							<span class="font-mono text-[10px] text-snip-text-secondary">
								{editor.formatTimestamp(segment.start)}
							</span>
						</div>
						<div class="flex flex-shrink-0 items-center gap-px">
							{#each editor.miniBarHeights(segment) as height, index (`mini-bar-${segment.id}-${index}`)}
								<div
									class="w-px rounded-full bg-[#2a2a2a] transition-colors group-hover:bg-[#3a3a3a]"
									style={`height:${height + index % 2}px;`}
								></div>
							{/each}
						</div>
					</button>
				{/each}
			{:else if editor.isBusy}
				<div class="space-y-3 p-4">
					{#each Array.from({ length: 6 }) as _, index (`cut-skeleton-${index}`)}
						<div class="flex items-center gap-3 rounded-xl border border-snip-border bg-snip-surface-elevated p-3">
							<Skeleton class="h-8 w-0.5 rounded-full bg-white/40" />
							<Skeleton class="size-[14px] rounded-[3px] bg-white/12" />
							<div class="flex-1 space-y-2">
								<Skeleton class={`h-3 rounded bg-white/${index % 2 === 0 ? "12" : "20"}`} />
								<Skeleton class="h-2 w-20 rounded bg-white/10" />
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="px-4 py-8 text-sm text-snip-text-secondary">
					Upload a file to populate detected filler words, pauses, and retakes.
				</div>
			{/if}
		</div>

		<div class="border-t border-snip-border bg-snip-bg px-4 py-3">
			<button
				type="button"
				class="w-full rounded-[8px] bg-primary py-2 text-[12px] font-semibold text-white transition-all disabled:pointer-events-none disabled:opacity-40"
				disabled={!editor.videoUrl || editor.selectedCutIds.length === 0}
				onclick={() => {
					editor.setPreviewMode("after");
					void editor.previewAppliedCuts();
				}}
			>
				Preview {editor.selectedCutIds.length} selected cut{editor.selectedCutIds.length === 1 ? "" : "s"}
			</button>
		</div>
	</aside>

	<main class="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-snip-bg">
		<VideoPreview />

		<div class="flex h-[84px] flex-shrink-0 flex-col justify-center gap-1.5 overflow-hidden border-t border-snip-border bg-snip-surface px-4 pb-[120px]">
			<span class="text-[9px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
				Timeline
			</span>

			{#if editor.timelineBars.length > 0}
				<div class="relative flex h-8 items-end gap-px">
					{#each editor.timelineBars as height, index (`timeline-bar-${index}`)}
						<div class="flex-1 rounded-sm bg-[#2a2a2a]" style={`height:${height}px;`}></div>
					{/each}

					{#each editor.cutSegments as segment (segment.id)}
						<div
							class="absolute inset-y-0 border-x"
							style={`left:${(segment.start / editor.totalDurationMs) * 100}%;width:${Math.max(
								((segment.end - segment.start) / editor.totalDurationMs) * 100,
								0.3
							)}%;background:${segment.color}22;border-color:${segment.color}90;`}
						></div>
					{/each}

					{#if editor.totalDurationMs > 0}
						<div
							class="absolute inset-y-0 w-px bg-primary"
							style={`left:${Math.min((editor.currentTimeMs / editor.totalDurationMs) * 100, 100)}%;`}
						>
							<div class="absolute -top-[3px] left-1/2 h-[7px] w-[7px] -translate-x-1/2 rotate-45 bg-primary"></div>
						</div>
					{/if}
				</div>

				<div class="flex justify-between px-0.5">
					{#each editor.timelineLabels as item (item.id)}
						<span class="font-mono text-[9px] text-snip-text-muted">{item.label}</span>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					<div class="flex h-8 items-end gap-px">
						{#each Array.from({ length: 24 }) as _, index (`timeline-skeleton-${index}`)}
							<Skeleton class={`flex-1 rounded-sm bg-white/${index % 2 === 0 ? "10" : "14"}`} style={`height:${10 + (index % 5) * 4}px;`} />
						{/each}
					</div>
					<Skeleton class="h-2 w-full rounded bg-white/10" />
				</div>
			{/if}
		</div>
	</main>
</div>
