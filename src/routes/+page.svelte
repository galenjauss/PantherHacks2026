<script lang="ts">
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import exampleVideoUrl from "$lib/assets/example_vid3.MOV";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	import ScissorsIcon from "@lucide/svelte/icons/scissors";
	import UploadIcon from "@lucide/svelte/icons/upload";

	let isActivating = $state(false);
	let isDragging = $state(false);
	let inputRef = $state<HTMLInputElement | null>(null);
	let activationTimeout: ReturnType<typeof setTimeout> | null = null;

	function clearActivationTimeout() {
		if (!activationTimeout) return;
		clearTimeout(activationTimeout);
		activationTimeout = null;
	}

	function pulseActivation(duration = 850) {
		clearActivationTimeout();
		isActivating = true;
		activationTimeout = setTimeout(() => {
			isActivating = false;
			activationTimeout = null;
		}, duration);
	}

	function handleUploadClick() {
		pulseActivation();
		inputRef?.click();
	}

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		const nextTarget = event.relatedTarget as Node | null;
		if (
			nextTarget &&
			event.currentTarget instanceof Node &&
			event.currentTarget.contains(nextTarget)
		) {
			return;
		}
		isDragging = false;
	}

	async function handleDroppedFiles(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		await handleFileSelection(event.dataTransfer?.files ?? null);
	}

	async function handleFileSelection(files: FileList | null) {
		const file = files?.[0] ?? null;
		clearActivationTimeout();
		isActivating = false;

		if (!file) return;

		await editor.setFile(file);
		await goto("/video-editor");
	}

	async function handleExampleVideoClick() {
		clearActivationTimeout();
		isActivating = true;

		try {
			const response = await fetch(exampleVideoUrl);
			const blob = await response.blob();
			const file = new File([blob], "example_vid3.MOV", {
				type: blob.type || "video/quicktime",
			});

			await editor.setFile(file);
			await goto("/video-editor");
		} finally {
			clearActivationTimeout();
			isActivating = false;
		}
	}

	onMount(() => {
		return () => clearActivationTimeout();
	});
</script>

<svelte:head>
	<title>Snip | Transcript-Aware Cleanup</title>
	<meta
		name="description"
		content="Upload audio or video, detect filler words and retakes from the transcript, and jump straight to clean timestamps."
	/>
</svelte:head>

<div class="dark relative min-h-svh overflow-x-clip bg-snip-bg text-snip-text-primary">
	<div class="pointer-events-none absolute inset-0 top-[7rem]">
		<div class="mx-auto h-full w-full max-w-7xl px-4 sm:px-5 lg:px-8">
			<div class="relative h-[calc(100svh-7rem)]">
				<div
					class="absolute left-[-5%] top-[22%] h-112 w-88 -rotate-12 rounded-[2.5rem] border border-white/6 bg-[linear-gradient(145deg,rgba(248,248,246,0.96),rgba(224,223,218,0.9))] shadow-[0_28px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.95)]"
				></div>

				<div
					class="absolute left-[-6%] top-[47%] h-px w-87 -rotate-12 border-t-2 border-dashed border-primary/55 opacity-80"
				></div>
				<p
					class="font-display absolute left-[7%] top-[41%] -rotate-12 text-5xl font-semibold tracking-tight text-black/70"
				>
					um...
				</p>
				<div class="absolute left-[20%] top-[33%] rotate-155">
					<div class="relative">
						<div
							class="absolute inset-0 rounded-full bg-primary/25 blur-2xl"
						></div>
						<div
							class="relative flex size-23 items-center justify-center rounded-full bg-[linear-gradient(145deg,#bb6cff,#7c3aed)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_20px_36px_rgba(124,58,237,0.28)]"
						>
							<ScissorsIcon class="size-12" stroke-width={2.4} />
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div
		class="relative z-10 mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 py-4 sm:px-5 lg:px-8"
	>
		<header class="z-20 py-4">
			<div class="flex items-center gap-3">
				<div
					class="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_rgba(124,58,237,0.25)]"
				>
					<ScissorsIcon class="size-5" />
				</div>
				<div>
					<p
						class="font-display text-sm font-bold tracking-[0.18em] text-white uppercase"
					>
						Snip
					</p>
					<p class="font-display text-xs text-snip-text-secondary">
						Transcript-first cleanup
					</p>
				</div>
			</div>
		</header>

		<section
			class="relative flex min-h-[calc(100svh-7rem)] items-center justify-center py-16 sm:py-20"
		>

			<div
				class="relative z-10 flex w-full max-w-4xl flex-col items-center text-center"
			>
				<p
					class="font-display mb-5 text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground"
				>
					Audio + video upload
				</p>

				<h1
					class="font-display max-w-4xl text-5xl leading-[1.26] font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl"
				>
					<span class="block">Snip a clip</span>
					<span class="block">into perfection</span>
				</h1>

				<p
					class="mt-6 max-w-2xl text-lg leading-8 text-snip-text-secondary"
				>
					Snip reads the transcript, marks filler words, long pauses,
					and retakes, then surfaces exact timestamps so you can jump
					straight into cleanup.
				</p>

				<div class="mt-10 flex w-full max-w-2xl flex-col items-center">
					<div
						role="button"
						tabindex="0"
						aria-label="Upload audio or video"
						class={`group w-full rounded-[1.75rem] border border-dashed bg-snip-surface/92 px-4 py-4 transition-all duration-200 ${
							isDragging
								? "border-primary/70 shadow-[0_0_0_1px_rgba(124,58,237,0.25)]"
								: isActivating
									? "cursor-progress border-primary/60"
									: "cursor-pointer border-snip-border hover:border-white/25"
						}`}
						onclick={handleUploadClick}
						onkeydown={(event) =>
							event.key === "Enter" || event.key === " "
								? handleUploadClick()
								: null}
						ondragenter={handleDragEnter}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDroppedFiles}
					>
						<Button
							size="lg"
							variant="hero"
							class={`h-14 w-full rounded-[1.2rem] border bg-snip-surface-elevated px-6 text-base font-semibold text-white transition-all duration-200 ${
								isDragging
									? "border-primary/70"
									: isActivating
										? "cursor-progress border-primary/60"
										: "border-snip-border group-hover:border-primary/70 group-hover:bg-primary group-hover:shadow-[0_0_0_1px_rgba(124,58,237,0.22)]"
							}`}
						>
							<span class="flex items-center gap-3">
								<span
									class="grid size-7 place-items-center rounded-full border border-white/10 bg-snip-surface text-snip-text-secondary"
								>
									<UploadIcon class="size-4" />
								</span>
								{isActivating
									? "Preparing upload..."
									: "Upload media"}
							</span>
						</Button>
					</div>

					<button
						type="button"
						class="mt-4 text-lg text-snip-text-secondary underline underline-offset-5 transition-colors duration-200 hover:text-primary"
						onclick={handleExampleVideoClick}
					>
						Use an example video.
					</button>

					<p class="mt-10 text-sm text-snip-text-secondary">
						Drag and drop audio or video, or click to upload
					</p>
				</div>
			</div>
		</section>

		<section class="pb-16 pt-4 sm:pb-20">
			<div
				class="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]"
			>
				<div class="space-y-4">
					<p
						class="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground"
					>
						Sample snip
					</p>
					<h2
						class="max-w-xl text-3xl leading-[1.31] font-semibold tracking-tight text-white sm:text-4xl"
					>
						See the cut happen before we wire up the full demo flow
					</h2>
					<p
						class="max-w-xl text-base leading-7 text-snip-text-secondary"
					>
						This section is here to test the scroll experience and
						give you a place to show a sample clip being trimmed.
						Right now it uses your scissor-cutting reference
						animation.
					</p>
				</div>

				<div
					class="rounded-[2rem] border border-snip-border bg-snip-surface p-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)]"
				>
					<div
						class="overflow-hidden rounded-[1.5rem] border border-snip-border bg-black"
					>
						<video
							class="aspect-video w-full object-cover"
							src="/media/scissors-cutting-demo.webm"
							autoplay
							muted
							loop
							playsinline
							controls
						>
							<track kind="captions" />
						</video>
					</div>
					<div class="mt-4 flex items-center justify-between gap-4">
						<div>
							<p class="text-sm font-medium text-white">
								Scissor cutting reference
							</p>
							<p class="mt-1 text-sm text-snip-text-secondary">
								Used as a stand-in for the future sample snip
								preview.
							</p>
						</div>
						<div
							class="rounded-full border border-snip-border bg-snip-surface-elevated px-3 py-1 text-xs text-snip-text-secondary"
						>
							webm sample
						</div>
					</div>
				</div>
			</div>
		</section>

		<Input
			bind:ref={inputRef}
			type="file"
			accept="video/*,audio/*"
			class="hidden"
			onchange={(event) =>
				handleFileSelection(
					(event.currentTarget as HTMLInputElement).files,
				)}
		/>
	</div>
</div>
