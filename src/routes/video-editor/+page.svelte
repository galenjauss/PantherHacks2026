<script lang="ts">
	import { fade } from "svelte/transition";
	import favicon from "$lib/assets/favicon.svg";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Button } from "$lib/components/ui/button";
	import * as Resizable from "$lib/components/ui/resizable";

	import SnipAIPanel from "$lib/components/sidebar/SnipAIPanel.svelte";
	import CutSettingsPanel from "$lib/components/sidebar/CutSettingsPanel.svelte";
	import ScriptPanel from "$lib/components/sidebar/ScriptPanel.svelte";
	import VideoPreview from "$lib/components/main/VideoPreview.svelte";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	let sidebarTab = $state<"transcript" | "script" | "cuts" | "settings">("transcript");

	function handleSeekSlot(_slotId: string, startMs: number) {
		editor.seekTo(startMs);
	}

	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import FileVideoIcon from "@lucide/svelte/icons/file-video";
	import ScissorsIcon from "@lucide/svelte/icons/scissors";

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
							{#if editor.isBusy}
								<div class="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
									<div transition:fade={{ duration: 180 }} class="flex flex-shrink-0 flex-col">
										<SnipAIPanel />
									</div>
								</div>
							{:else}
								<!-- Tab bar -->
								<div class="flex-shrink-0 border-b border-snip-border px-3 pt-2.5 pb-2">
									<div class="flex rounded-lg bg-snip-bg p-0.5">
										{#each [
											{ id: "transcript" as const, label: "Transcript" },
											{ id: "script" as const, label: "Script" },
											{ id: "cuts" as const, label: "Cuts" },
											{ id: "settings" as const, label: "Settings" },
										] as tab (tab.id)}
											<button
												onclick={() => (sidebarTab = tab.id)}
												class="flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all
													{sidebarTab === tab.id
													? 'bg-snip-surface-elevated text-white shadow-sm'
													: 'text-snip-text-muted hover:text-snip-text-secondary'}"
											>
												{tab.label}
												{#if tab.id === "cuts" && editor.filteredCutSegments.length > 0}
													<span class="ml-1 text-[10px] opacity-50">{editor.filteredCutSegments.length}</span>
												{/if}
											</button>
										{/each}
									</div>
								</div>

								<!-- Tab content -->
								<div class="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
									{#if sidebarTab === "transcript"}
										<div class="flex flex-col gap-3 px-4 py-4">
											{#if editor.transcriptText}
												<p class="whitespace-pre-wrap text-[12px] leading-[1.7] text-snip-text-primary">
													{editor.transcriptText}
												</p>
											{:else}
												<p class="text-[12px] text-snip-text-muted">
													{editor.selectedFile
														? "Transcript will appear here once processing completes."
														: "Upload a video to generate a transcript."}
												</p>
											{/if}
										</div>

									{:else if sidebarTab === "script"}
										<ScriptPanel onSeekSlot={handleSeekSlot} />

									{:else if sidebarTab === "cuts"}
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
												<span class="text-[11px] text-snip-text-muted">{editor.selectedCutCount} active</span>
											</div>

											{#each editor.filteredCutSegments as segment (segment.id)}
												<button
													type="button"
													class="group flex w-full items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-snip-surface-elevated"
													onclick={() => editor.toggleCutSelection(segment.id)}
												>
													<div class="h-8 w-0.5 flex-shrink-0 rounded-full" style={`background:${segment.color}`}></div>
													<Checkbox
														checked={segment.locked || editor.selectedCutIds.includes(segment.id)}
														disabled={segment.locked}
														class="size-[14px] flex-shrink-0 rounded-[3px] border-[#333333] bg-snip-surface data-checked:border-primary data-checked:bg-primary group-hover:border-[#555555]"
													/>
													<div class="min-w-0 flex-1">
														<div class="flex items-center justify-between gap-2">
															<span class="truncate text-[12px] font-medium text-white">
																{segment.label}
																{#if segment.locked}
																	<span class="ml-1 text-[10px] font-normal text-snip-text-muted">(locked)</span>
																{/if}
															</span>
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
										{:else}
											<div class="px-4 py-8 text-sm text-snip-text-secondary">
												{editor.selectedFile
													? "No filler, pauses, or discarded alternates remain in the active composition."
													: "Upload a file to populate detected filler words, pauses, and semantic alternates."}
											</div>
										{/if}

									{:else if sidebarTab === "settings"}
										<CutSettingsPanel />
									{/if}
								</div>
							{/if}
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
				<!-- Minimal header -->
				<div class="flex h-7 flex-shrink-0 items-center justify-between border-b border-snip-border px-4">
					<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
						Timeline
					</span>

					<div class="text-[10px] tabular-nums text-snip-text-muted">
						{#if editor.totalDurationMs > 0}
							{editor.selectedCutCount} cuts &middot;
							<span class="text-snip-text-secondary">{editor.formatDuration(editor.selectedCutDurationMs)} saved</span>
							&middot; {editor.formatClock(editor.cleanDurationMs)} final
						{:else}
							Waiting for transcript&hellip;
						{/if}
					</div>
				</div>

				<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					{#if editor.clipStripBeatBlocks.length > 0}
						{@const timelineBlocks = editor.editedTimelineBlocks}
						{@const labels = editor.timelineLabels}

						<!-- Time ruler -->
						<div class="relative mx-4 mt-2 h-4 flex-shrink-0">
							{#each labels as tick, i (tick.id)}
								<div
									class="absolute top-0 flex flex-col items-center"
									style="left:{(i / (labels.length - 1)) * 100}%;transform:translateX({i === 0 ? '0' : i === labels.length - 1 ? '-100%' : '-50%'});"
								>
									<div class="h-[5px] w-px bg-snip-text-muted/40"></div>
									<span class="mt-px font-mono text-[8px] tabular-nums text-snip-text-muted">{tick.label}</span>
								</div>
							{/each}
							<!-- Minor ticks between labels -->
							{#each Array.from({ length: (labels.length - 1) * 2 }) as _, midIdx (`mid-${midIdx}`)}
								{@const pos = ((midIdx + 0.5) / ((labels.length - 1) * 2)) * 100}
								<div
									class="absolute top-0 h-[3px] w-px bg-snip-text-muted/20"
									style="left:{pos}%;"
								></div>
							{/each}
						</div>

						<!-- Timeline bar -->
						<div class="mx-4 flex h-7 items-stretch gap-px overflow-hidden rounded-t">
							{#each timelineBlocks as block (block.id)}
								{#if block.kind === "beat"}
									<button
										type="button"
										class="group relative flex items-center overflow-hidden transition-opacity hover:opacity-90"
										style="width:{block.widthPct}%;background:{block.color}33;border-bottom:2px solid {block.color};"
										onclick={() => editor.seekTo(block.startMs)}
										title="{block.humanLabel}: {block.label}"
									>
										{#if block.widthPct > 6}
											<span
												class="truncate px-2 text-[10px] font-medium"
												style="color:{block.color};"
											>
												{block.label}
											</span>
										{/if}
									</button>
								{:else if block.kind === "cut"}
									<div
										class="relative flex items-center justify-center"
										style="width:{block.widthPct}%;background:repeating-linear-gradient(
											-45deg,
											#ef444412,
											#ef444412 2px,
											transparent 2px,
											transparent 5px
										);border-bottom:2px solid #ef444466;"
										title="Cut: {block.label} ({editor.formatSegmentDuration(block.durationMs)})"
									>
										{#if block.widthPct > 5}
											<span class="truncate px-1 text-[8px] font-medium text-[#ef4444]/70">
												{block.label}
											</span>
										{/if}
									</div>
								{:else}
									<div
										class="opacity-40"
										style="width:{block.widthPct}%;background:#1a1a1a;border-bottom:2px solid #2a2a2a;"
									></div>
								{/if}
							{/each}
						</div>

						<!-- Slot selectors -->
						<div class="mx-4 mt-px flex min-h-0 flex-1 items-start gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{#each editor.clipStripBeatBlocks as block (block.id)}
								<div
									class="flex min-w-[90px] flex-col gap-0.5"
									style="width:{block.widthPct}%;"
								>
									<span class="truncate px-1 pt-1 font-mono text-[8px] uppercase tracking-[0.15em] text-snip-text-muted">
										{block.beatId.replace(/^slot_/, "S")}
									</span>
									{#each block.variants as variant (variant.id)}
										<button
											type="button"
											class="relative flex items-center justify-between gap-1 overflow-hidden border px-2 py-[3px] text-left transition-colors hover:border-primary/60 {variant.isSelected
												? 'border-primary bg-primary/10'
												: 'border-snip-border bg-snip-surface'}"
											style="border-radius:4px;"
											onclick={() => {
												editor.selectSlotVariant(block.beatId, variant.variantId);
												editor.seekTo(variant.start);
											}}
										>
											<span class="truncate text-[10px] {variant.isSelected ? 'font-medium text-white' : 'text-snip-text-secondary'}">
												{variant.label}
											</span>
											<span class="flex-shrink-0 font-mono text-[9px] text-snip-text-muted">
												{editor.formatSegmentDuration(variant.durationMs)}
											</span>
										</button>
									{/each}
								</div>
							{/each}
						</div>

					{:else if editor.clipStripSegments.length > 0}
						{@const labels = editor.timelineLabels}

						<!-- Time ruler for segment view -->
						<div class="relative mx-4 mt-2 h-4 flex-shrink-0">
							{#each labels as tick, i (tick.id)}
								<div
									class="absolute top-0 flex flex-col items-center"
									style="left:{(i / (labels.length - 1)) * 100}%;transform:translateX({i === 0 ? '0' : i === labels.length - 1 ? '-100%' : '-50%'});"
								>
									<div class="h-[5px] w-px bg-snip-text-muted/40"></div>
									<span class="mt-px font-mono text-[8px] tabular-nums text-snip-text-muted">{tick.label}</span>
								</div>
							{/each}
						</div>

						<!-- Segment bar -->
						<div class="mx-4 flex flex-1 items-center gap-[2px] overflow-hidden">
							{#each editor.clipStripSegments as segment (segment.id)}
								<button
									type="button"
									class="flex h-full max-h-[48px] min-w-[2px] cursor-pointer items-center justify-center overflow-hidden rounded-sm transition hover:brightness-125"
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

						<!-- Inline legend for segment colors -->
						<div class="mx-4 flex items-center gap-3 pb-1 pt-1">
							{#each [
								{ color: "#22c55e", label: "keep" },
								{ color: "#ef4444", label: "filler" },
								{ color: "#6b7280", label: "pause" },
								{ color: "#3b82f6", label: "retake" }
							] as item (item.label)}
								<div class="flex items-center gap-1">
									<div class="size-1.5 rounded-full" style="background:{item.color};"></div>
									<span class="text-[9px] text-snip-text-muted">{item.label}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="flex flex-1 items-center gap-[2px] px-4 py-3">
							{#each skeletonWidths as width, index (`skeleton-${index}`)}
								<Skeleton
									class={`h-full max-h-[48px] rounded-sm bg-white/${index % 3 === 0 ? "15" : "10"}`}
									style={`width:${width}%;`}
								/>
							{/each}
							<div class="flex-1"></div>
						</div>
					{/if}
				</div>
			</div>
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>
