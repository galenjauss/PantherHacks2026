<script lang="ts">
	import { scale } from "svelte/transition";
	import { Button } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import ScissorsIcon from "@lucide/svelte/icons/scissors";
	import WandSparklesIcon from "@lucide/svelte/icons/wand-sparkles";

	let videoEl = $state<HTMLVideoElement | null>(null);
	let idle = $state(false);
	let idleTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	const previewBlocked = $derived(editor.isBusy || editor.isSyncing);

	function resetIdle() {
		idle = false;
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			idle = true;
		}, 2000);
	}

	$effect(() => {
		editor.setVideoElement(videoEl);

		return () => {
			editor.setVideoElement(null);
		};
	});
</script>

<div class="flex min-h-0 flex-1 flex-col bg-snip-bg">
	<div
		class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3"
		onmousemove={resetIdle}
		onmouseenter={resetIdle}
		role="presentation"
	>
		{#key editor.videoUrl}
			<div
				class="relative aspect-video max-h-full max-w-full overflow-hidden rounded-[20px] border border-snip-border bg-black/70 shadow-[0_40px_120px_rgba(0,0,0,0.35)]"
				style={editor.previewFrameStyle}
				in:scale={{ start: 0.96, duration: 300, opacity: 0 }}
			>
				{#if editor.videoUrl}
					<video
						bind:this={videoEl}
						src={editor.videoUrl}
						class="h-full w-full object-contain"
						preload="auto"
						onended={() => editor.handleBeforePlaybackEnded()}
						onloadedmetadata={() =>
							editor.setVideoMetadata(videoEl)}
						ontimeupdate={() =>
							editor.updateCurrentTime(videoEl?.currentTime ?? 0)}
					>
						<track kind="captions" />
					</video>

					<!-- Filename overlay pill -->
					{#if editor.selectedFile}
						<div
							class="pointer-events-none absolute top-3 left-4 flex items-center rounded-full bg-black/50 px-3 py-1 text-xs text-white/30 backdrop-blur-sm"
						>
							<span class="max-w-[200px] truncate"
								>{editor.selectedFile.name}</span
							>
						</div>
					{/if}

					{#if editor.activeSubtitleCue}
						<div class="pointer-events-none absolute inset-0 z-10" style="container-type: inline-size;">
							<div
								class="absolute flex justify-center"
								style={editor.subtitleOverlayStyle}
							>
								<div class="text-center" style={editor.subtitleOverlayBoxStyle}>
									{#each editor.activeSubtitleCue.words as word, index (index)}
										{#if word.lineBreakBefore}
											<br />
										{/if}
										{#if word.leadingSpace}
											<span> </span>
										{/if}
										<span style={editor.activeSubtitleWordIndex === index
											? `color: ${editor.subtitleStyle.activeWordColor};`
											: `color: ${editor.subtitleStyle.textColor};`}>
											{word.text}
										</span>
									{/each}
								</div>
							</div>
						</div>
					{/if}

					<!-- Center play/pause overlay -->
					<button
						type="button"
						class="absolute inset-0 flex items-center justify-center transition-opacity duration-300 {previewBlocked
							? 'pointer-events-none cursor-default opacity-0'
							: `cursor-pointer ${idle && editor.isPreviewPlaying ? 'opacity-0' : 'opacity-100'}`}"
						disabled={!editor.videoUrl || previewBlocked}
						onclick={() => void editor.previewAppliedCuts()}
					>
						<div
							class="flex size-14 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
						>
							{#if editor.isPreviewPlaying}
								<PauseIcon class="size-6" />
							{:else}
								<PlayIcon class="ml-0.5 size-6" />
							{/if}
						</div>
					</button>
				{:else}
					<div
						class="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
					>
						<div class="rounded-2xl bg-primary/12 p-4 text-primary">
							<WandSparklesIcon class="size-8" />
						</div>
						<div class="space-y-2">
							<h2
								class="font-display text-2xl font-semibold text-white"
							>
								Upload a source clip
							</h2>
							<p
								class="max-w-md text-sm leading-6 text-snip-text-secondary"
							>
								Start from the home page or replace the file
								from the sidebar to populate the live preview.
							</p>
						</div>
					</div>
				{/if}
			</div>
		{/key}
	</div>

	<!-- Control bar between video preview and clip strip -->
	{#if editor.videoUrl}
		<div
			class="mx-3 mb-3 flex h-11 shrink-0 items-center gap-3 rounded-xl border border-snip-border/25 bg-snip-surface/60 px-2 backdrop-blur-sm"
		>
			<!-- Play / Pause button -->
			<button
				type="button"
				class="flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
				disabled={!editor.videoUrl}
				onclick={() => void editor.previewAppliedCuts()}
			>
				{#if editor.isPreviewPlaying}
					<PauseIcon class="size-4" />
				{:else}
					<PlayIcon class="ml-0.5 size-4" />
				{/if}
			</button>

			<!-- Timestamp -->
			<span class="font-mono text-xs tracking-wide text-white/50">
				{editor.formatClock(editor.currentTimeMs)}<span class="mx-0.5 text-white/25">/</span>{editor.formatClock(editor.totalDurationMs)}
			</span>

			<div class="mx-0.5 h-4 w-px bg-snip-border/40"></div>

			<ToggleGroup.Root
				type="single"
				value={editor.previewMode}
				disabled={editor.isBusy}
				onValueChange={(value) => {
					if (value)
						editor.setPreviewMode(value as "before" | "after");
				}}
				class="flex items-center gap-0.5 rounded-full border border-snip-border/50 bg-snip-bg/60 p-0.5 {editor.isBusy
					? 'pointer-events-none opacity-40'
					: ''}"
				spacing={4}
			>
				<ToggleGroup.Item
					value="before"
					class="font-display rounded-full px-3 py-1 text-xs font-medium text-snip-text-muted transition-all hover:text-white data-[state=on]:bg-white/12 data-[state=on]:text-white data-[state=on]:shadow-sm"
				>
					Before
				</ToggleGroup.Item>
				<ToggleGroup.Item
					value="after"
					class="font-display rounded-full px-3 py-1 text-xs font-medium text-snip-text-muted transition-all hover:text-white data-[state=on]:bg-primary data-[state=on]:text-white data-[state=on]:shadow-[0_0_12px_rgba(124,58,237,0.4)]"
				>
					After
				</ToggleGroup.Item>
			</ToggleGroup.Root>

			{#if editor.totalDurationMs > 0}
				{@const savedPct = Math.round(
					(editor.selectedCutDurationMs / editor.totalDurationMs) *
						100,
				)}
				<div class="mx-0.5 h-4 w-px bg-snip-border/40"></div>
				<div
					class="flex items-center gap-2.5 text-[13px] tabular-nums tracking-tight text-snip-text-muted"
				>
					<span>
						<span class="font-semibold text-primary"
							>{editor.formatDuration(
								editor.selectedCutDurationMs,
							)}</span
						>
						<span class="ml-0.5 text-white/30">saved</span>
					</span>
					<span class="text-white/15">·</span>
					<span>
						<span class="font-semibold text-white/90">{savedPct}%</span>
						<span class="ml-0.5 text-white/30">shorter</span>
					</span>
					<span class="text-white/15">·</span>
					<span>
						<span class="font-semibold text-white/90"
							>{editor.selectedCutCount}</span
						>
						<span class="ml-0.5 text-white/30">cuts</span>
					</span>
					<span class="text-white/15">·</span>
					<span>
						<span class="font-semibold text-white/90"
							>{editor.formatClock(editor.cleanDurationMs)}</span
						>
						<span class="ml-0.5 text-white/30">final</span>
					</span>
				</div>
			{/if}

			<div class="flex-1"></div>

			<Button
				variant="outline"
				size="sm"
				class="snip-again-btn rounded-lg border-snip-border/50 bg-snip-bg/60 text-snip-text-primary transition-transform hover:scale-[1.03] hover:bg-snip-surface-elevated active:scale-95"
				disabled={!editor.jobId}
				onclick={() => void editor.pollJob()}
			>
				<ScissorsIcon
					class="mr-1.5 size-3.5 transition-transform duration-200 ease-out"
				/>
				<span class="font-display text-xs">Snip Again</span>
			</Button>
		</div>
	{/if}
</div>

<style>
	:global(.snip-again-btn:hover svg:first-child) {
		transform: rotate(-15deg);
	}
</style>
