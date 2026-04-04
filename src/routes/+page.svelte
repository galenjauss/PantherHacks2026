<script lang="ts">
	import { goto } from "$app/navigation";
	import { Button } from "$lib/components/ui/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { Input } from "$lib/components/ui/input";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
	import FileVideoIcon from "@lucide/svelte/icons/file-video";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import UploadIcon from "@lucide/svelte/icons/upload";

	let inputRef = $state<HTMLInputElement | null>(null);

	async function handleFiles(files: FileList | null) {
		const file = files?.[0] ?? null;
		if (!file) return;

		await editor.setFile(file);
		await goto("/video-editor");
	}
</script>

<svelte:head>
	<title>PantherHacks Video Editor</title>
</svelte:head>

<div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_36%),linear-gradient(180deg,_#fff_0%,_#f7f4ff_45%,_#f5f6fb_100%)]">
	<div class="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-6 py-16">
		<div class="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
			<div class="space-y-6">
				<Badge variant="outline" class="rounded-full border-primary/20 bg-white/70 px-4 py-1 text-primary">
					PantherHacks 2026
				</Badge>

				<div class="space-y-4">
					<h1 class="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
						Upload a video and continue in the live editor.
					</h1>
					<p class="max-w-2xl text-lg leading-8 text-slate-600">
						The editor now runs the real transcription, analysis, and autocut job flow. Upload from
						here and you’ll land directly in <code class="font-medium text-slate-950">/video-editor</code>.
					</p>
				</div>

				<div class="flex flex-wrap gap-3 text-sm text-slate-600">
					<div class="rounded-full border border-slate-200 bg-white/80 px-4 py-2">AssemblyAI transcript</div>
					<div class="rounded-full border border-slate-200 bg-white/80 px-4 py-2">Real filler + pause labels</div>
					<div class="rounded-full border border-slate-200 bg-white/80 px-4 py-2">shadcn loading states</div>
				</div>

				{#if editor.selectedFile}
					<div class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
						<div class="flex items-center gap-3">
							<div class="rounded-xl bg-primary/10 p-3 text-primary">
								<FileVideoIcon class="size-5" />
							</div>
							<div>
								<p class="font-medium text-slate-950">{editor.selectedFile.name}</p>
								<p class="text-sm text-slate-500">
									{(editor.selectedFile.size / 1024 / 1024).toFixed(2)} MB loaded
								</p>
							</div>
						</div>
						<Button class="ml-auto" onclick={() => goto("/video-editor")}>
							Resume in editor
						</Button>
					</div>
				{/if}
			</div>

			<Card class="border-slate-200/80 bg-white/85 shadow-xl shadow-primary/5 backdrop-blur">
				<CardHeader class="space-y-3">
					<div class="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
						<SparklesIcon class="size-5" />
					</div>
					<CardTitle class="text-2xl">Start with a source video</CardTitle>
					<CardDescription class="text-base leading-7">
						Choose a local `.mp4`, `.mov`, or another video file. The editor will automatically kick
						off the real processing pipeline.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<Input
						bind:ref={inputRef}
						type="file"
						accept="video/*"
						class="hidden"
						onchange={(event) => handleFiles((event.currentTarget as HTMLInputElement).files)}
					/>

					<button
						type="button"
						class="flex w-full flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center transition hover:border-primary/40 hover:bg-primary/5"
						onclick={() => inputRef?.click()}
					>
						<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
							<UploadIcon class="size-6" />
						</div>
						<div class="space-y-1">
							<p class="text-lg font-medium text-slate-950">Choose a video</p>
							<p class="text-sm text-slate-500">We’ll route you straight into the editor.</p>
						</div>
					</button>

					<p class="text-sm leading-6 text-slate-500">
						After upload, the editor shows real transcript polling, real cut detection, and shadcn
						skeletons while the pipeline is still running.
					</p>
				</CardContent>
			</Card>
		</div>
	</div>
</div>
