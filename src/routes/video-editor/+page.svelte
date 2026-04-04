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

	let sidebarTab = $state<"script" | "cuts" | "settings">("script");

	function handleSeekBeat(_beatId: string, startMs: number) {
		editor.seekTo(startMs);
	}

	import FileVideoIcon from "@lucide/svelte/icons/file-video";
	import ScissorsIcon from "@lucide/svelte/icons/scissors";
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

		<!-- Filename + inline upload -->
		<div class="ml-4 hidden items-center gap-2 text-sm text-snip-text-secondary md:flex">
			<FileVideoIcon class="size-4 shrink-0" stroke-width={1.75} />
			<span class="max-w-[240px] truncate">{editor.selectedFile?.name ?? "No file loaded"}</span>
			<button
				type="button"
				class="ml-1 flex size-7 items-center justify-center rounded-lg text-snip-text-muted transition-colors hover:bg-snip-surface-elevated hover:text-white"
				title="Replace file"
				onclick={() => topBarFileInput?.click()}
			>
				<UploadIcon class="size-3.5" stroke-width={2} />
			</button>
			<input
				bind:this={topBarFileInput}
				type="file"
				accept="video/*,audio/*"
				class="hidden"
				onchange={handleTopBarFileChange}
			/>
		</div>
	</header>

	<Resizable.PaneGroup direction="vertical" class="min-h-0 flex-1">
		<Resizable.Pane defaultSize={80} minSize={40}>
			<div class="h-full overflow-hidden">
				<Resizable.PaneGroup direction="horizontal" class="h-full">
					<Resizable.Pane defaultSize={25} minSize={15} maxSize={40}>
						<aside class="flex h-full flex-col overflow-hidden border-r border-snip-border bg-snip-surface">
							<!-- Hero stats — single source of truth -->
							{#if editor.totalDurationMs > 0}
								{@const savedPct = editor.totalDurationMs > 0 ? Math.round((editor.selectedCutDurationMs / editor.totalDurationMs) * 100) : 0}
								<div class="flex-shrink-0 border-b border-snip-border px-4 py-3">
									<div class="flex items-baseline gap-2">
										<span class="font-display text-2xl font-bold text-primary">
											{editor.formatDuration(editor.selectedCutDurationMs)} saved
										</span>
										<span class="font-display text-lg font-semibold text-snip-text-secondary">
											{savedPct}%
										</span>
									</div>
									<p class="mt-0.5 text-[12px] text-snip-text-secondary">
										{editor.selectedCutCount} cuts · {editor.formatClock(editor.cleanDurationMs)} clean runtime
									</p>
								</div>
							{/if}

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
											{ id: "script" as const, label: "Script" },
											{ id: "cuts" as const, label: "Cuts" },
											{ id: "settings" as const, label: "Settings" },
										] as tab (tab.id)}
											<button
												onclick={() => (sidebarTab = tab.id)}
												class="font-display flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all
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
									{#if sidebarTab === "script"}
										<ScriptPanel onSeekBeat={handleSeekBeat} />

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
										{:else}
											<div class="px-4 py-8 text-sm text-snip-text-secondary">
												{editor.selectedFile
													? "No filler, pauses, or retakes remain in the active composition."
													: "Upload a file to populate detected filler words, pauses, and retakes."}
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
				<div class="flex h-8 flex-shrink-0 items-center justify-between border-b border-snip-border px-4">
					<div class="flex items-center gap-3">
						<span class="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">
							Clip strip
						</span>
						<div class="hidden items-center gap-2.5 md:flex">
							{#if editor.clipStripBeatBlocks.length > 0}
								{#each beatStripLegend as item (item.label)}
									<div class="flex items-center gap-1.5">
										<div
											class="size-2 rounded-[3px]"
											style={`background:${item.color};${"border" in item ? `border:1px solid ${item.border}` : ""}`}
										></div>
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
								{editor.swappableBeatCount} beat swaps
							{/if}
						{:else}
							Waiting for transcript data
						{/if}
					</div>
				</div>

				<div class="relative min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-4">
					{#if editor.clipStripBeatBlocks.length > 0}
						{@const timelineBlocks = editor.editedTimelineBlocks}
						<!-- Timeline strip: beats + cuts shown inline -->
						<div class="flex h-full flex-col gap-1.5">
							<!-- Top row: continuous timeline bar -->
							<div class="flex h-8 items-stretch gap-px overflow-hidden rounded">
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
											class="relative flex items-center justify-center opacity-50"
											style="width:{block.widthPct}%;background:repeating-linear-gradient(
												-45deg,
												#ef444425,
												#ef444425 2px,
												#ef444408 2px,
												#ef444408 5px
											);border-bottom:2px solid #ef444488;"
											title="Removed: {block.label} ({editor.formatSegmentDuration(block.durationMs)})"
										>
											{#if block.widthPct > 5}
												<span class="truncate px-1 text-[8px] font-medium text-[#ef4444]">
													{block.label}
												</span>
											{/if}
										</div>
									{:else}
										<div
											style="width:{block.widthPct}%;background:#1a1a1a;border-bottom:2px solid #2a2a2a;"
										></div>
									{/if}
								{/each}
							</div>

							<!-- Bottom row: beat variant selectors -->
							<div class="flex min-h-0 flex-1 items-start gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								{#each editor.clipStripBeatBlocks as block (block.id)}
									<div
										class="flex min-w-[100px] flex-col gap-1"
										style="width:{block.widthPct}%;"
									>
										<span class="truncate px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-snip-text-muted">
											{block.beatId.replace(/^beat_/, "B")}
										</span>
										{#each block.variants as variant (variant.id)}
											{@const isRetake = variant.label.toLowerCase().includes("retake")}
											<button
												type="button"
												class="relative flex items-center justify-between gap-1 overflow-hidden border px-2 py-1 text-left transition-colors hover:border-primary/60 {variant.isSelected
													? 'border-primary bg-primary/10'
													: 'border-snip-border bg-snip-surface'}"
												style="border-radius:4px;"
												onclick={() => {
													editor.selectBeatVariant(block.beatId, variant.id);
													editor.seekTo(variant.start);
												}}
											>
												<span class="truncate text-[10px] {variant.isSelected ? 'font-medium text-white' : isRetake ? 'italic text-snip-text-muted' : 'text-snip-text-secondary'}">
													{variant.label}
												</span>
												<span class="shrink-0 font-mono text-[9px] text-snip-text-muted">
													{editor.formatSegmentDuration(variant.durationMs)}
												</span>
											</button>
										{/each}
									</div>
								{/each}
							</div>
						</div>
					{:else if editor.clipStripSegments.length > 0}
						<div class="flex h-full items-center gap-[2px] overflow-hidden">
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
