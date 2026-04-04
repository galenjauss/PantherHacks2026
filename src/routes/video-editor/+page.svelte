<script lang="ts">
	import { fade } from "svelte/transition";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import * as Resizable from "$lib/components/ui/resizable";

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

<Resizable.PaneGroup direction="horizontal" class="h-full">
	<Resizable.Pane defaultSize={25} minSize={15} maxSize={40}>
	<aside class="flex h-full flex-col overflow-hidden border-r border-snip-border bg-snip-surface">
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
				{#if editor.isBusy}
					<Skeleton class="h-[18px] w-28 rounded-full bg-white/8" />
				{:else}
					<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[3px] text-[10px] text-snip-text-secondary">
						{editor.selectedCutCount} selected · {editor.formatDuration(editor.selectedCutDurationMs)}
					</span>
				{/if}
			</div>

			{#if editor.isBusy}
				<div class="flex flex-wrap gap-1.5">
					{#each filters as filter (filter.id)}
						<div class="flex items-center gap-1.5 rounded-[6px] px-2 py-[5px]">
							<span class="text-[11px] font-medium text-snip-text-muted">{filter.label}</span>
							<Skeleton class="h-3.5 w-4 rounded-full bg-white/6" />
						</div>
					{/each}
				</div>
			{:else}
				<ToggleGroup.Root
					type="single"
					value={editor.activeFilter}
					onValueChange={(value) => { if (value) editor.activeFilter = value as typeof editor.activeFilter; }}
					class="flex flex-wrap gap-1.5"
					spacing={4}
				>
					{#each filters as filter (filter.id)}
						<ToggleGroup.Item
							value={filter.id}
							class="flex items-center gap-1.5 rounded-[6px] border border-transparent px-2 py-[5px] text-[11px] font-medium text-snip-text-secondary transition-colors hover:text-white data-[state=on]:border-[#333333] data-[state=on]:bg-snip-surface-elevated data-[state=on]:text-white"
						>
							{filter.label}
							<Badge variant="secondary" class="h-auto rounded-full px-1.5 py-0 text-[10px] text-snip-text-muted">{editor.cutCounts[filter.id]}</Badge>
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			{/if}
		</div>

		<div class="flex items-center justify-between border-b border-snip-border px-4 py-[7px]">
			{#if editor.isBusy}
				<Skeleton class="h-3 w-28 rounded bg-white/6" />
				<Skeleton class="h-3 w-16 rounded bg-white/6" />
			{:else}
				<div class="flex items-center">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => editor.selectAllCuts()}
						class="h-auto px-2 py-1 text-[11px] text-snip-text-secondary hover:bg-transparent hover:text-white"
					>
						Select all
					</Button>
					<span class="text-[11px] text-snip-text-muted">·</span>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => editor.clearSelectedCuts()}
						class="h-auto px-2 py-1 text-[11px] text-snip-text-secondary hover:bg-transparent hover:text-white"
					>
						Deselect
					</Button>
				</div>
				<span class="text-[11px] text-snip-text-muted">{editor.selectedCutIds.length} selected</span>
			{/if}
		</div>

		<div
			class="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{#if editor.filteredCutSegments.length > 0}
				{#each editor.filteredCutSegments as segment (segment.id)}
					<button
						type="button"
						class="group flex w-full items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-snip-surface-elevated"
						onclick={() => editor.toggleCutSelection(segment.id)}
					>
						<div class="h-8 w-0.5 flex-shrink-0 rounded-full" style={`background:${segment.color}`}></div>
						<Checkbox
							checked={editor.selectedCutIds.includes(segment.id)}
							class="size-[14px] flex-shrink-0 rounded-[3px] border-[#333333] bg-snip-surface data-checked:border-primary data-checked:bg-primary group-hover:border-[#555555]"
						/>
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
				<div>
					{#each Array.from({ length: 6 }) as _, index (`cut-skeleton-${index}`)}
						<div class="flex items-center gap-3 px-4 py-[10px]">
							<Skeleton class="h-8 w-0.5 flex-shrink-0 rounded-full bg-white/15" />
							<Skeleton class="size-[14px] flex-shrink-0 rounded-[3px] bg-white/8" />
							<div class="min-w-0 flex-1 space-y-2">
								<div class="flex items-center justify-between gap-2">
									<Skeleton class={`h-3 rounded bg-white/${index % 2 === 0 ? "10" : "14"}`} style={`width:${50 + (index % 3) * 20}%`} />
									<Skeleton class="h-2.5 w-8 flex-shrink-0 rounded bg-white/8" />
								</div>
								<Skeleton class="h-2 w-16 rounded bg-white/6" />
							</div>
							<div class="flex flex-shrink-0 items-center gap-px">
								{#each Array.from({ length: 8 }) as _, barIdx (`skeleton-bar-${index}-${barIdx}`)}
									<Skeleton class="w-px rounded-full bg-white/6" style={`height:${6 + (barIdx % 3) * 3}px`} />
								{/each}
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
			<Button
				class="w-full rounded-[8px] text-[12px] font-semibold"
				disabled={!editor.videoUrl || editor.selectedCutIds.length === 0}
				onclick={() => {
					editor.setPreviewMode("after");
					void editor.previewAppliedCuts();
				}}
			>
				Preview {editor.selectedCutIds.length} selected cut{editor.selectedCutIds.length === 1 ? "" : "s"}
			</Button>
		</div>
	</aside>
	</Resizable.Pane>

	<Resizable.Handle withHandle class="bg-snip-border" />

	<Resizable.Pane defaultSize={75} minSize={40}>
		<main class="relative flex h-full min-w-0 flex-col overflow-hidden bg-snip-bg">
			<VideoPreview />
		</main>
	</Resizable.Pane>
</Resizable.PaneGroup>
