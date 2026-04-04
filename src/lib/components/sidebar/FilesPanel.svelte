<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
	import FilmIcon from "@lucide/svelte/icons/film";
	import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";

	let inputRef = $state<HTMLInputElement | null>(null);

	async function handleFiles(files: FileList | null) {
		const file = files?.[0] ?? null;
		if (!file) return;

		await editor.setFile(file);
	}
</script>

<div class="flex flex-col gap-3 p-4">
	<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">Files</span>

	{#if editor.selectedFile}
		<div class="flex items-center gap-3 rounded-xl border border-snip-border bg-snip-surface-elevated px-3 py-3">
			<div class="flex size-10 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#1f1f1f]">
				<FilmIcon class="size-[15px] text-snip-text-muted" />
			</div>

			<div class="min-w-0 flex-1">
				<p class="truncate text-[13px] font-medium text-white">{editor.selectedFile.name}</p>
				<p class="font-mono text-[11px] text-snip-text-secondary">
					{(editor.selectedFile.size / 1024 / 1024).toFixed(2)} MB
					{#if editor.totalDurationMs > 0}
						· {editor.formatClock(editor.totalDurationMs)}
					{/if}
				</p>
			</div>

			<div
				class={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium ${
					editor.isReady
						? "border border-emerald-500/20 bg-emerald-500/15 text-emerald-400"
						: editor.hasErrors
							? "border border-red-500/20 bg-red-500/10 text-red-400"
							: "bg-primary text-white"
				}`}
			>
				{#if editor.isBusy}
					<LoaderCircleIcon class="size-3.5 animate-spin" />
				{/if}
				<span>{editor.statusLabel.toLowerCase()}</span>
			</div>
		</div>
	{:else}
		<div class="rounded-xl border border-dashed border-[#2a2a2a] bg-snip-surface-elevated px-4 py-5 text-sm text-snip-text-secondary">
			Select a video to initialize the transcript, analysis, and cut preview.
		</div>
	{/if}

	<Input
		bind:ref={inputRef}
		type="file"
		accept="video/*"
		class="hidden"
		onchange={(event) => handleFiles((event.currentTarget as HTMLInputElement).files)}
	/>

	<Button
		variant="outline"
		class="justify-center border-snip-border bg-transparent text-snip-text-primary hover:bg-snip-surface-elevated"
		onclick={() => inputRef?.click()}
	>
		<FolderOpenIcon class="mr-1 size-4" />
		{editor.selectedFile ? "Replace file" : "Browse files"}
	</Button>
</div>
