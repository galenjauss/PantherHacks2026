<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RefreshCcwIcon from "@lucide/svelte/icons/refresh-ccw";
	import WandSparklesIcon from "@lucide/svelte/icons/wand-sparkles";

	let videoEl = $state<HTMLVideoElement | null>(null);

	$effect(() => {
		editor.setVideoElement(videoEl);

		return () => {
			editor.setVideoElement(null);
		};
	});
</script>

<div class="flex min-h-0 flex-1 flex-col bg-snip-bg">
	<div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-8">
		<div class="relative flex max-h-full w-full items-center justify-center">
			<div class="relative w-full max-h-full aspect-video overflow-hidden rounded-[20px] border border-snip-border bg-black/70 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
				{#if editor.videoUrl}
					<video
						bind:this={videoEl}
						src={editor.videoUrl}
						class="h-full w-full object-contain"
						preload="auto"
						onended={() => editor.handleBeforePlaybackEnded()}
						onloadedmetadata={() => editor.setVideoDuration(videoEl?.duration ?? 0)}
						ontimeupdate={() => editor.updateCurrentTime(videoEl?.currentTime ?? 0)}
					>
						<track kind="captions" />
					</video>

					<div class="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
						<div class="flex items-center gap-2 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 backdrop-blur">
							<span class={`size-2 rounded-full ${editor.isReady ? "bg-emerald-400" : "bg-primary"}`}></span>
							<span class="text-[11px] font-medium text-white">
								{editor.previewMode === "after" ? "clean preview" : "source preview"}
							</span>
						</div>
					</div>

					{#if editor.isBusy}
						<div class="pointer-events-none absolute inset-x-0 bottom-0 p-4">
							<div class="rounded-2xl border border-white/10 bg-black/65 p-4 backdrop-blur">
								<div class="mb-3 flex items-center gap-2 text-sm text-white">
									<WandSparklesIcon class="size-4 text-primary" />
									<span>{editor.statusDescription}</span>
								</div>
								<div class="space-y-2">
									<Skeleton class="h-2 w-full rounded bg-white/12" />
									<Skeleton class="h-2 w-4/5 rounded bg-white/10" />
									<Skeleton class="h-2 w-3/5 rounded bg-white/10" />
								</div>
							</div>
						</div>
					{/if}
				{:else}
					<div class="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
						<div class="rounded-2xl bg-primary/12 p-4 text-primary">
							<WandSparklesIcon class="size-8" />
						</div>
						<div class="space-y-2">
							<h2 class="text-2xl font-semibold text-white">Upload a source clip</h2>
							<p class="max-w-md text-sm leading-6 text-snip-text-secondary">
								Start from the home page or replace the file from the sidebar to populate the live preview.
							</p>
						</div>
					</div>
				{/if}
			</div>

			<div class="pointer-events-none absolute bottom-3 right-4 text-[11px] font-mono text-white/40">
				{editor.formatClock(editor.currentTimeMs)} / {editor.formatClock(editor.totalDurationMs)}
			</div>
		</div>
	</div>

	<div class="flex h-[52px] flex-shrink-0 items-center justify-between gap-4 border-t border-snip-border px-4">
		<div class="flex items-center gap-2.5">
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-snip-text-secondary hover:bg-snip-surface hover:text-white"
				disabled={!editor.videoUrl}
				onclick={() => void editor.previewAppliedCuts()}
			>
				{#if editor.isPreviewPlaying}
					<PauseIcon class="size-4" />
				{:else}
					<PlayIcon class="size-4" />
				{/if}
			</Button>

			<span class="font-mono text-[13px] tabular-nums text-snip-text-secondary">
				{editor.formatClock(editor.currentTimeMs)} / {editor.formatClock(editor.totalDurationMs)}
			</span>
		</div>

		{#if editor.videoUrl}
			<div class="flex items-center gap-3">
				<Badge
					variant="outline"
					class="border-snip-border bg-snip-surface text-snip-text-primary"
				>
					−{editor.formatDuration(editor.selectedCutDurationMs)}
				</Badge>

				<span class="text-[13px] font-medium text-white">{editor.formatClock(editor.cleanDurationMs)} clean</span>

				<ToggleGroup.Root
					type="single"
					value={editor.previewMode}
					onValueChange={(value) => { if (value) editor.setPreviewMode(value as "before" | "after"); }}
					class="flex items-center gap-1 rounded-full border border-snip-border bg-snip-surface p-1"
					spacing={4}
				>
					<ToggleGroup.Item
						value="before"
						class="rounded-full px-3 py-[5px] text-[11px] font-medium text-snip-text-secondary transition-colors hover:text-white data-[state=on]:bg-snip-surface-elevated data-[state=on]:text-white"
					>
						before
					</ToggleGroup.Item>
					<ToggleGroup.Item
						value="after"
						class="rounded-full px-3 py-[5px] text-[11px] font-medium text-snip-text-secondary transition-colors hover:text-white data-[state=on]:bg-primary data-[state=on]:text-white"
					>
						after
					</ToggleGroup.Item>
				</ToggleGroup.Root>

				<Button
					variant="outline"
					size="sm"
					class="border-snip-border bg-snip-surface text-snip-text-primary hover:bg-snip-surface-elevated"
					disabled={!editor.jobId}
					onclick={() => void editor.pollJob()}
				>
					<RefreshCcwIcon class="mr-1 size-4" />
					Refresh job
				</Button>
			</div>
		{:else}
			<div class="space-y-1">
				<Skeleton class="h-3 w-32 rounded bg-white/10" />
				<Skeleton class="h-3 w-24 rounded bg-white/10" />
			</div>
		{/if}
	</div>
</div>
