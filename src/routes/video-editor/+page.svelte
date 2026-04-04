<script lang="ts">
	import { fade } from "svelte/transition";
	import favicon from "$lib/assets/favicon.svg";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Button } from "$lib/components/ui/button";
	import * as Resizable from "$lib/components/ui/resizable";

	import SnipAIPanel from "$lib/components/sidebar/SnipAIPanel.svelte";
	import CutSettingsPanel from "$lib/components/sidebar/CutSettingsPanel.svelte";
	import BeatSwapPanel from "$lib/components/sidebar/BeatSwapPanel.svelte";
	import VideoPreview from "$lib/components/main/VideoPreview.svelte";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import FileVideoIcon from "@lucide/svelte/icons/file-video";
	import ScissorsIcon from "@lucide/svelte/icons/scissors";

	const legend = [
		{ color: "#22c55e", label: "keep" },
		{ color: "#ef4444", label: "filler" },
		{ color: "#6b7280", label: "pause" },
		{ color: "#3b82f6", label: "retake" }
	] as const;
	const takeLegend = [
		{ color: "#f5f5f5", label: "selected take" },
		{ color: "rgba(245,245,245,0.28)", label: "final option" },
		{ color: "rgba(59,130,246,0.5)", label: "retake option" }
	] as const;
	const skeletonWidths = [7, 5, 9, 6, 8, 10, 4, 12, 6, 11, 8];

	$effect(() => {
		void editor.maybeStartProcessing();
	});

	$effect(() => {
		const signature = editor.beatSelectionSignature;
		editor.syncBeatSelections(signature);
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

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Video Editor</title>
</svelte:head>

<div class="dark flex h-screen flex-col overflow-hidden bg-snip-bg text-snip-text-primary">
	<header class="flex h-16 flex-shrink-0 items-center gap-3 border-b border-snip-border bg-snip-bg px-4">
		<div class="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
			<ScissorsIcon class="size-10" stroke-width={1.75} />
		</div>

		<div class="space-y-0.5">
			<p class="text-sm font-semibold text-white">PantherHacks Editor</p>
			<p class="text-xs text-snip-text-secondary">{editor.statusDescription}</p>
		</div>

		<div class="ml-6 hidden items-center gap-2.5 rounded-full border border-snip-border bg-snip-surface px-4 py-2 text-xs text-snip-text-secondary md:flex">
			<FileVideoIcon class="size-8 shrink-0" stroke-width={1.75} />
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
				size="lg"
				class="border-snip-border bg-snip-surface px-5 text-base text-snip-text-primary hover:bg-snip-surface-elevated"
				href="/"
			>
				<ArrowLeftIcon class="mr-2 size-8 shrink-0" stroke-width={1.75} />
				New upload
			</Button>
		</div>
	</header>

	<Resizable.PaneGroup direction="vertical" class="min-h-0 flex-1">
		<Resizable.Pane defaultSize={80} minSize={40}>
			<div class="h-full overflow-hidden">
				<Resizable.PaneGroup direction="horizontal" class="h-full">
					<Resizable.Pane defaultSize={25} minSize={15} maxSize={40}>
						<aside class="flex h-full flex-col overflow-hidden border-r border-snip-border bg-snip-surface">
							<div class="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								{#if editor.isBusy}
									<div transition:fade={{ duration: 180 }} class="flex flex-shrink-0 flex-col">
										<SnipAIPanel />
									</div>
								{:else}
									<div transition:fade={{ duration: 180 }} class="flex flex-shrink-0 flex-col">
										<CutSettingsPanel />
									</div>

									{#if editor.swappableBeatGroups.length > 0}
										<div class="border-t border-snip-border"></div>

										<div transition:fade={{ duration: 180 }} class="flex flex-shrink-0 flex-col">
											<BeatSwapPanel />
										</div>
									{/if}
								{/if}

								<div class="border-t border-snip-border"></div>

								<div class="min-h-0 flex-1">
									{#if editor.filteredCutSegments.length > 0}
										<div class="flex flex-shrink-0 items-center justify-between border-b border-snip-border px-4 py-[7px]">
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
										</div>

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
											{editor.selectedFile
												? "No filler, pauses, or retakes remain in the active composition."
												: "Upload a file to populate detected filler words, pauses, and retakes."}
										</div>
									{/if}
								</div>
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
			</div>
		</Resizable.Pane>

		<Resizable.Handle withHandle class="bg-snip-border" />

		<Resizable.Pane defaultSize={20} minSize={8} maxSize={50}>
			<div class="flex h-full flex-col border-t border-snip-border bg-snip-surface">
				<div class="flex h-8 flex-shrink-0 items-center justify-between border-b border-snip-border px-4">
					<div class="flex items-center gap-3">
						<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
							Clip strip
						</span>
						<div class="hidden items-center gap-2.5 md:flex">
							{#if editor.clipStripBeatBlocks.length > 0}
								{#each takeLegend as item (item.label)}
									<div class="flex items-center gap-1.5">
										<div class="size-2 rounded-[3px]" style={`background:${item.color}`}></div>
										<span class="text-[10px] text-snip-text-secondary">{item.label}</span>
									</div>
								{/each}
							{:else}
								{#each legend as item (item.label)}
									<div class="flex items-center gap-1.5">
										<div class="size-2 rounded-[3px]" style={`background:${item.color}`}></div>
										<span class="text-[10px] text-snip-text-secondary">{item.label}</span>
									</div>
								{/each}
							{/if}
						</div>
					</div>

					<div class="text-[11px] text-snip-text-secondary">
						{#if editor.totalDurationMs > 0}
							{#if editor.swappableBeatCount > 0}
								{editor.swappableBeatCount} beat swaps ·
							{/if}
							{editor.selectedCutCount} selected cuts · {editor.formatDuration(editor.selectedCutDurationMs)}
							saved · {editor.formatClock(editor.cleanDurationMs)} clean runtime
						{:else}
							Waiting for transcript data
						{/if}
					</div>
				</div>

				<div class="relative min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-4">
					{#if editor.clipStripBeatBlocks.length > 0}
						<div class="flex h-full min-w-full items-start gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{#each editor.clipStripBeatBlocks as block (block.id)}
								<div
									class="flex h-full min-w-[112px] flex-col gap-2 rounded-xl border border-snip-border bg-snip-bg/55 p-2"
									style={`width:${block.widthPct}%;`}
								>
									<div class="flex items-center justify-between gap-2">
										<span class="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-snip-text-muted">
											{block.beatId}
										</span>
										<span class="truncate text-[10px] text-snip-text-secondary">
											{block.activeLabel}
										</span>
									</div>

									<div class="flex min-h-0 flex-1 flex-col gap-1.5">
										{#each block.variants as variant (variant.id)}
											<button
												type="button"
												class={`relative min-h-[28px] overflow-hidden rounded-lg border bg-snip-surface text-left transition-colors hover:border-primary/60 ${
													variant.isSelected
														? "border-primary shadow-[0_0_0_1px_rgba(124,58,237,0.25)]"
														: "border-snip-border"
												}`}
												onclick={() => {
													editor.selectBeatVariant(block.beatId, variant.id);
													editor.seekTo(variant.start);
												}}
											>
												<div
													class="absolute inset-y-0 left-0 rounded-lg"
													style={`width:${variant.fillPct}%;background:${
														variant.isSelected
															? "rgba(124,58,237,0.28)"
															: variant.kind === "retake"
																? "rgba(59,130,246,0.24)"
																: "rgba(245,245,245,0.12)"
													};`}
												></div>
												<div class="relative flex items-center justify-between gap-2 px-2 py-1.5">
													<span class={`truncate text-[10px] font-medium ${variant.isSelected ? "text-white" : "text-snip-text-secondary"}`}>
														{variant.label}
													</span>
													<span class="font-mono text-[9px] text-snip-text-muted">
														{editor.formatSegmentDuration(variant.durationMs)}
													</span>
												</div>
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{:else if editor.clipStripSegments.length > 0}
						<div class="flex h-full items-center gap-[2px] overflow-hidden">
						{#each editor.clipStripSegments as segment (segment.id)}
							<button
								type="button"
								class="flex h-full max-h-[64px] min-w-[2px] cursor-pointer items-center justify-center overflow-hidden rounded-sm transition hover:brightness-125"
								style={`width:${segment.widthPct}%;background:${
									segment.type === "good"
										? "#22c55e"
										: segment.type === "filler_words"
											? "#ef4444"
											: segment.type === "dead_space"
												? "#6b7280"
												: "#3b82f6"
								};`}
								onclick={() => editor.seekTo(segment.start)}
								>
									{#if segment.label && segment.widthPct > 4}
										<span class="truncate px-1 text-[8px] font-semibold text-white/90">{segment.label}</span>
									{/if}
								</button>
							{/each}
						</div>
					{:else}
						<div class="flex h-full items-center gap-[2px]">
							{#each skeletonWidths as width, index (`skeleton-${index}`)}
								<Skeleton
									class={`h-full max-h-[64px] rounded-sm bg-white/${index % 3 === 0 ? "15" : "10"}`}
									style={`width:${width}%;`}
								/>
							{/each}
							<div class="flex-1"></div>
						</div>
					{/if}

					<div class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-[linear-gradient(to_right,#111111,transparent)]"></div>
					<div class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-[linear-gradient(to_left,#111111,transparent)]"></div>
				</div>
			</div>
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>
