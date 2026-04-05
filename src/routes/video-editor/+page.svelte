<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import favicon from "$lib/assets/favicon.svg";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Button } from "$lib/components/ui/button";
	import * as Resizable from "$lib/components/ui/resizable";
	import AnimatedNumber from "$lib/components/ui/AnimatedNumber.svelte";

	import SnipAIPanel from "$lib/components/sidebar/SnipAIPanel.svelte";
	import CutSettingsPanel from "$lib/components/sidebar/CutSettingsPanel.svelte";
	import ScriptPanel from "$lib/components/sidebar/ScriptPanel.svelte";
	import TranscriptPanel from "$lib/components/sidebar/TranscriptPanel.svelte";
	import VideoPreview from "$lib/components/main/VideoPreview.svelte";
	import * as Dialog from "$lib/components/ui/dialog";
	import ClipTreeTimeline from "$lib/components/main/ClipTreeTimeline.svelte";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	let sidebarTab = $state<"transcript" | "script" | "cuts" | "settings">("transcript");
	let showStatsDialog = $state(false);
	let wasBusy = $state(false);
	let prevTranscriptWordCount = $state(0);

	$effect(() => {
		const busy = editor.isBusy;
		if (busy) {
			editor.setPreviewMode("before");
		} else if (wasBusy && !busy && editor.wordLabels.length > 0) {
			editor.setPreviewMode("after");
		}
		if (wasBusy && !busy && editor.totalDurationMs > 0) {
			showStatsDialog = true;
		}
		wasBusy = busy;
	});

	$effect(() => {
		const n = editor.transcriptPanelWords.length;
		if (n === 0) {
			prevTranscriptWordCount = 0;
			return;
		}
		if (prevTranscriptWordCount === 0 && n > 0) {
			sidebarTab = "transcript";
		}
		prevTranscriptWordCount = n;
	});

	function handleSeekSlot(_slotId: string, startMs: number) {
		editor.seekTo(startMs);
	}

	import ScissorsIcon from "@lucide/svelte/icons/scissors";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import UploadIcon from "@lucide/svelte/icons/upload";

	let topBarFileInput = $state<HTMLInputElement | null>(null);

	async function handleTopBarFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (file) await editor.setFile(file);
	}

	const legend = [
		{ color: "#22c55e", label: "keep" },
		{ color: "#ef4444", label: "filler" },
		{ color: "#6b7280", label: "pause" },
		{ color: "#3b82f6", label: "retake" }
	] as const;
	const beatStripLegend = [
		{ color: "#7c3aed", label: "kept beat" },
		{ color: "#ef4444", label: "cut" },
		{ color: "#1a1a1a", border: "#2a2a2a", label: "gap" }
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
	<header class="flex h-14 shrink-0 items-center gap-3 border-b border-snip-border bg-snip-bg px-4">
		<!-- Logo — clickable home link -->
		<a href="/" class="flex items-center gap-2.5 transition-opacity hover:opacity-80">
			<div class="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
				<ScissorsIcon class="size-5" stroke-width={2} />
			</div>
			<span class="font-display text-base font-bold tracking-wide text-white">Snip</span>
		</a>

		<!-- Upload button -->
		<div class="ml-auto flex items-center gap-3">
			{#if editor.exportStatusLabel}
				<p
					class={`hidden text-[11px] md:block ${editor.exportError ? "text-red-400" : "text-snip-text-muted"}`}
				>
					{editor.exportStatusLabel}
				</p>
			{/if}

			<Button
				variant="outline"
				size="sm"
				class="border-snip-border bg-snip-surface text-snip-text-primary transition-transform hover:scale-[1.03] hover:bg-snip-surface-elevated active:scale-95"
				disabled={!editor.canExport}
				onclick={() => void editor.exportSelectedCuts()}
			>
				<DownloadIcon class="mr-1.5 size-3.5" stroke-width={2} />
				<span class="font-display text-xs font-semibold">
					{editor.exporting ? "Exporting" : "Export"}
				</span>
			</Button>

			<div class="hidden md:flex">
				<Button
					variant="outline"
					size="sm"
					class="border-snip-border bg-snip-surface text-snip-text-primary transition-transform hover:scale-[1.03] hover:bg-snip-surface-elevated active:scale-95"
					onclick={() => topBarFileInput?.click()}
				>
					<UploadIcon class="mr-1.5 size-3.5" stroke-width={2} />
					<span class="font-display text-xs font-semibold">
						{editor.selectedFile ? "New Upload" : "Upload"}
					</span>
				</Button>
				<input
					bind:this={topBarFileInput}
					type="file"
					accept="video/*,audio/*"
					class="hidden"
					onchange={handleTopBarFileChange}
				/>
			</div>
		</div>
	</header>

	<Resizable.PaneGroup direction="vertical" class="min-h-0 flex-1">
		<Resizable.Pane defaultSize={80} minSize={40}>
			<div class="h-full overflow-hidden">
				<Resizable.PaneGroup direction="horizontal" class="h-full">
					<Resizable.Pane defaultSize={25} minSize={15} maxSize={40}>
						<aside class="flex h-full flex-col overflow-hidden border-r border-snip-border bg-snip-surface">
							{#if editor.isBusy}
								<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
									<div
										transition:fade={{ duration: 180 }}
										class={`shrink-0 border-b border-snip-border ${
											editor.transcriptPanelWords.length > 0
												? "max-h-[min(260px,42vh)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
												: "min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
										}`}
									>
										<SnipAIPanel />
									</div>
									{#if editor.transcriptPanelWords.length > 0}
										<div
											class="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-snip-border"
											transition:fade={{ duration: 200 }}
										>
											<TranscriptPanel
												words={editor.transcriptPanelWords}
												activeWordId={editor.activeTranscriptWordId}
												isPlaying={editor.isPreviewPlaying}
												onToggleGroup={(ids) => editor.toggleTranscriptGroup(ids)}
												onSeek={(timeMs) => editor.seekTo(timeMs)}
											/>
										</div>
									{/if}
								</div>
							{:else}
								<!-- Tab bar -->
								{@const tabs = [
											{ id: "transcript" as const, label: "Transcript" },
									{ id: "script" as const, label: "Script" },
									{ id: "cuts" as const, label: "Cuts" },
									{ id: "settings" as const, label: "Settings" },
								]}
								{@const activeIndex = tabs.findIndex(t => t.id === sidebarTab)}
								<div class="shrink-0 border-b border-snip-border px-3 pt-2.5 pb-2">
									<div class="relative flex rounded-lg bg-snip-bg p-0.5">
										<!-- Sliding indicator -->
										<div
											class="absolute top-0.5 bottom-0.5 rounded-md bg-snip-surface-elevated shadow-sm transition-all duration-250 ease-[cubic-bezier(0.25,1,0.5,1)]"
											style="width:{100 / tabs.length}%;left:{(activeIndex * 100) / tabs.length}%;"
										></div>
										{#each tabs as tab (tab.id)}
											<button
												onclick={() => (sidebarTab = tab.id)}
												class="font-display relative z-10 flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-colors
													{sidebarTab === tab.id
													? 'text-white'
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
										{#if editor.transcriptPanelWords.length > 0}
											<TranscriptPanel
												words={editor.transcriptPanelWords}
												activeWordId={editor.activeTranscriptWordId}
												isPlaying={editor.isPreviewPlaying}
												onToggleGroup={(ids) => editor.toggleTranscriptGroup(ids)}
												onSeek={(timeMs) => editor.seekTo(timeMs)}
											/>
										{:else}
											<div class="flex flex-col gap-3 px-4 py-4">
												<p class="text-[12px] text-snip-text-muted">
													{editor.selectedFile
														? "Transcript will appear here once processing completes."
														: "Upload a video to generate a transcript."}
												</p>
											</div>
										{/if}

									{:else if sidebarTab === "script"}
										<ScriptPanel onSeekSlot={handleSeekSlot} />

									{:else if sidebarTab === "cuts"}
										{#if editor.filteredCutSegments.length > 0}
											<div class="flex shrink-0 items-center justify-between border-b border-snip-border px-4 py-[7px]">
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

											{#each editor.filteredCutSegments as segment, i (segment.id)}
												<button
													type="button"
													class="group flex w-full items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-snip-surface-elevated"
													in:fly={{ x: -20, duration: 250, delay: Math.min(i * 40, 400) }}
													onclick={() => editor.toggleCutSelection(segment.id)}
												>
													<div class="h-8 w-0.5 shrink-0 rounded-full" style={`background:${segment.color}`}></div>
													<Checkbox
														checked={segment.locked || editor.selectedCutIds.includes(segment.id)}
														disabled={segment.locked}
														class="size-[14px] shrink-0 rounded-[3px] border-[#333333] bg-snip-surface data-checked:border-primary data-checked:bg-primary group-hover:border-[#555555]"
													/>
													<div class="min-w-0 flex-1">
														<div class="flex items-center justify-between gap-2">
															<span class="truncate text-[12px] font-medium text-white">
																{segment.label}
																{#if segment.locked}
																	<span class="ml-1 text-[10px] font-normal text-snip-text-muted">(locked)</span>
																{/if}
															</span>
															<span class="shrink-0 text-[10px] text-snip-text-muted">
																{editor.formatSegmentDuration(segment.durationMs)}
															</span>
														</div>
														<span class="font-mono text-[10px] text-snip-text-secondary">
															{editor.formatTimestamp(segment.start)}
														</span>
													</div>
													<div class="flex shrink-0 items-center gap-px">
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

					<Resizable.Handle withHandle class="bg-snip-border [&>div]:h-10 [&>div]:w-[5px] [&>div]:rounded-full [&>div]:bg-white/20 hover:[&>div]:bg-white/40 [&>div]:transition-colors" />

					<Resizable.Pane defaultSize={75} minSize={40}>
						<main class="relative flex h-full min-w-0 flex-col overflow-hidden bg-snip-bg">
							<VideoPreview />
						</main>
					</Resizable.Pane>
				</Resizable.PaneGroup>
			</div>
		</Resizable.Pane>

		<Resizable.Handle withHandle class="bg-snip-border [&[data-direction=vertical]>div]:rotate-0 [&[data-direction=vertical]>div]:h-[5px] [&[data-direction=vertical]>div]:w-10 [&[data-direction=vertical]>div]:rounded-full [&[data-direction=vertical]>div]:bg-white/20 hover:[&[data-direction=vertical]>div]:bg-white/40 [&[data-direction=vertical]>div]:transition-colors" />

		<Resizable.Pane defaultSize={20} minSize={8} maxSize={50}>
			<div class="flex h-full flex-col border-t border-snip-border/50 bg-snip-surface shadow-[0_-2px_8px_rgba(0,0,0,0.3)]">
				<!-- Minimal header -->
				<div class="flex h-7 shrink-0 items-center justify-between border-b border-snip-border px-4">
					<span class="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
						Timeline
					</span>

					<div class="text-[10px] tabular-nums text-snip-text-muted">
						{#if editor.totalDurationMs > 0}
							{editor.formatClock(editor.totalDurationMs)}
							{#if editor.swappableBeatCount > 0}
								&middot; {editor.swappableBeatCount} swaps
							{/if}
						{:else}
							Waiting for transcript&hellip;
						{/if}
					</div>
				</div>

				<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					{#if editor.clipStripBeatBlocks.length > 0}
						{@const timelineBlocks = editor.previewMode === "before" ? editor.beforeTimelineBlocks : editor.editedTimelineBlocks}
						{@const labels = editor.timelineLabels}

						<!-- Time ruler -->
						<div class="relative mx-4 mt-2 h-4 shrink-0">
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
										class="group relative flex items-center overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] hover:opacity-90"
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
										class="relative flex items-center justify-center opacity-50"
										style="width:{block.widthPct}%;background:repeating-linear-gradient(
											-45deg,
											#ef444425,
											#ef444425 2px,
											#ef444408 2px,
											#ef444408 5px
										);border-bottom:2px solid #ef444488;"
										title="Cut: {block.label} ({editor.formatSegmentDuration(block.durationMs)})"
									>
										{#if block.widthPct > 5}
											<span class="truncate px-1 text-[8px] font-medium text-[#ef4444]">
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

						<!-- Slot selectors (tree timeline) -->
						<ClipTreeTimeline
							blocks={editor.clipStripBeatBlocks}
							formatDuration={editor.formatSegmentDuration.bind(editor)}
							onSelectVariant={(slotId, variantId, startMs) => {
								editor.selectSlotVariant(slotId, variantId);
								editor.seekTo(startMs);
							}}
						/>

					{:else if editor.clipStripSegments.length > 0}
						{@const labels = editor.timelineLabels}

						<!-- Time ruler for segment view -->
						<div class="relative mx-4 mt-2 h-4 shrink-0">
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
								{@const isKept = segment.type === "good"}
								{@const segColor = isKept ? "#22c55e" : segment.type === "filler_words" ? "#ef4444" : segment.type === "dead_space" ? "#6b7280" : "#3b82f6"}
								<button
									type="button"
									class="flex h-full max-h-[64px] min-w-[2px] cursor-pointer items-center justify-center overflow-hidden rounded-sm transition hover:brightness-125 {isKept ? '' : 'opacity-40'}"
									style={`width:${segment.widthPct}%;${isKept ? `background:${segColor}` : `background:repeating-linear-gradient(-45deg,${segColor}30,${segColor}30 2px,${segColor}10 2px,${segColor}10 5px)`};`}
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

<Dialog.Root bind:open={showStatsDialog}>
	<Dialog.Content class="gap-0 overflow-hidden border-snip-border bg-snip-surface p-0 sm:max-w-sm">
		<div class="flex flex-col items-center gap-1 bg-gradient-to-b from-primary/15 to-transparent px-6 pt-7 pb-5">
			<ScissorsIcon class="mb-1 size-6 text-primary" />
			<Dialog.Title class="font-display text-lg font-bold text-white">Analysis Complete</Dialog.Title>
			<Dialog.Description class="text-[13px] text-snip-text-secondary">
				Here's what Snip AI found.
			</Dialog.Description>
		</div>

		{@const savedPct = editor.totalDurationMs > 0 ? Math.round((editor.selectedCutDurationMs / editor.totalDurationMs) * 100) : 0}
		<div class="grid grid-cols-2 gap-px bg-snip-border/50">
			<div class="flex flex-col gap-0.5 bg-snip-surface px-5 py-4">
				<span class="text-[10px] font-medium uppercase tracking-wider text-snip-text-muted">Saved</span>
				<span class="font-display text-xl font-extrabold tabular-nums text-primary">{editor.formatDuration(editor.selectedCutDurationMs)}</span>
			</div>
			<div class="flex flex-col gap-0.5 bg-snip-surface px-5 py-4">
				<span class="text-[10px] font-medium uppercase tracking-wider text-snip-text-muted">Shorter</span>
				<span class="font-display text-xl font-extrabold tabular-nums text-white">{savedPct}%</span>
			</div>
			<div class="flex flex-col gap-0.5 bg-snip-surface px-5 py-4">
				<span class="text-[10px] font-medium uppercase tracking-wider text-snip-text-muted">Cuts</span>
				<span class="font-display text-xl font-extrabold tabular-nums text-white">{editor.selectedCutCount}</span>
			</div>
			<div class="flex flex-col gap-0.5 bg-snip-surface px-5 py-4">
				<span class="text-[10px] font-medium uppercase tracking-wider text-snip-text-muted">Final</span>
				<span class="font-display text-xl font-extrabold tabular-nums text-white">{editor.formatClock(editor.cleanDurationMs)}</span>
			</div>
		</div>

		<div class="flex items-center justify-between border-t border-snip-border/50 bg-snip-surface px-5 py-3">
			<span class="text-[11px] text-snip-text-muted">
				Original: <span class="font-medium text-snip-text-secondary">{editor.formatClock(editor.totalDurationMs)}</span>
			</span>
			<Button size="sm" onclick={() => (showStatsDialog = false)} class="font-display px-5">
				Let's Edit
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
