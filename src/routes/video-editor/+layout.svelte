<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import FileVideoIcon from "@lucide/svelte/icons/file-video";
	import ScissorsIcon from "@lucide/svelte/icons/scissors";

	let { children } = $props();

	const legend = [
		{ color: "#f97316", label: "filler" },
		{ color: "#3b82f6", label: "pause" },
		{ color: "#22c55e", label: "retake" }
	] as const;
	const skeletonWidths = [7, 5, 9, 6, 8, 10, 4, 12, 6, 11, 8];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Video Editor</title>
</svelte:head>

<div class="dark flex h-screen flex-col overflow-hidden bg-snip-bg text-snip-text-primary">
	<header class="flex h-[56px] flex-shrink-0 items-center gap-3 border-b border-snip-border bg-snip-bg px-4">
		<div class="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
			<ScissorsIcon class="size-4" />
		</div>

		<div class="space-y-0.5">
			<p class="text-sm font-semibold text-white">PantherHacks Editor</p>
			<p class="text-xs text-snip-text-secondary">{editor.statusDescription}</p>
		</div>

		<div class="ml-6 hidden items-center gap-2 rounded-full border border-snip-border bg-snip-surface px-3 py-1 text-xs text-snip-text-secondary md:flex">
			<FileVideoIcon class="size-3.5" />
			<span class="max-w-[240px] truncate">{editor.selectedFile?.name ?? "No file loaded"}</span>
		</div>

		<div class="ml-auto flex items-center gap-4">
			<div class="flex items-center gap-2 text-xs text-snip-text-secondary">
				<span
					class="size-2 rounded-full"
					class:bg-emerald-500={editor.isReady}
					class:bg-primary={!editor.isReady && editor.selectedFile}
					class:bg-snip-text-muted={!editor.selectedFile}
				></span>
				<span>{editor.statusLabel}</span>
			</div>

			<Button
				variant="outline"
				class="border-snip-border bg-snip-surface text-snip-text-primary hover:bg-snip-surface-elevated"
				href="/"
			>
				<ArrowLeftIcon class="mr-1 size-4" />
				New upload
			</Button>
		</div>
	</header>

	<div class="min-h-0 flex-1 overflow-hidden">
		{@render children()}
	</div>

	<div class="fixed inset-x-0 bottom-0 z-40 h-[120px] border-t border-snip-border bg-snip-surface">
		<div class="flex h-8 items-center justify-between border-b border-snip-border px-4">
			<div class="flex items-center gap-3">
				<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
					Clip strip
				</span>
				<div class="hidden items-center gap-2.5 md:flex">
					{#each legend as item (item.label)}
						<div class="flex items-center gap-1.5">
							<div class="size-2 rounded-[3px]" style={`background:${item.color}`}></div>
							<span class="text-[10px] text-snip-text-secondary">{item.label}</span>
						</div>
					{/each}
				</div>
			</div>

			<div class="text-[11px] text-snip-text-secondary">
				{#if editor.totalDurationMs > 0}
					{editor.selectedCutCount} selected cuts · {editor.formatDuration(editor.selectedCutDurationMs)}
					saved · {editor.formatClock(editor.cleanDurationMs)} clean runtime
				{:else}
					Waiting for transcript data
				{/if}
			</div>
		</div>

		<div class="relative flex h-[88px] items-end gap-[2px] overflow-hidden px-4 pb-3 pt-4">
			{#if editor.clipStripSegments.length > 0}
				{#each editor.clipStripSegments as segment (segment.id)}
					<div
						class="flex min-w-[2px] items-center justify-center overflow-hidden rounded-t-sm transition hover:brightness-110"
						style={`width:${segment.widthPct}%;height:${segment.type === "good" ? 50 : 34}px;background:${
							segment.type === "good"
								? "rgba(245,245,245,0.22)"
								: segment.type === "filler_words"
									? "#f97316"
									: segment.type === "dead_space"
										? "#3b82f6"
										: "#22c55e"
						};`}
					>
						{#if segment.label && segment.widthPct > 4}
							<span class="truncate px-1 text-[8px] font-semibold text-white/90">{segment.label}</span>
						{/if}
					</div>
				{/each}
			{:else}
				{#each skeletonWidths as width, index (`skeleton-${index}`)}
					<Skeleton
						class={`rounded-t-sm bg-white/${index % 3 === 0 ? "15" : "10"}`}
						style={`width:${width}%;height:${index % 2 === 0 ? 44 : 28}px;`}
					/>
				{/each}
				<div class="flex-1"></div>
			{/if}

			<div class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-[linear-gradient(to_right,#111111,transparent)]"></div>
			<div class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-[linear-gradient(to_left,#111111,transparent)]"></div>
		</div>
	</div>
</div>
