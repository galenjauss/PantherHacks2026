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
					aria-hidden="true"
					class="snip-cut-scene absolute left-[-6%] top-[22%] h-[29rem] w-[24rem] -rotate-12"
				>
					<div class="snip-cut-layer snip-cut-layer-static">
						<div class="snip-cut-content">
							<div class="snip-paper-card"></div>
							<p class="snip-cut-copy font-display">um...</p>
						</div>
					</div>

					<div class="snip-cut-layer snip-cut-layer-falling">
						<div class="snip-cut-content">
							<div class="snip-paper-card"></div>
							<p class="snip-cut-copy font-display">um...</p>
						</div>
					</div>

					<div class="snip-cut-line"></div>
				</div>
				<div class="absolute left-[21%] top-[36%] rotate-162">
					<div class="relative">
						<div
							class="absolute inset-0 rounded-full bg-primary/25 blur-2xl"
						></div>
						<div
							class="relative flex size-22 items-center justify-center rounded-full bg-[linear-gradient(145deg,#bb6cff,#7c3aed)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_20px_36px_rgba(124,58,237,0.28)]"
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
							class="font-display text-md font-bold tracking-wider text-white uppercase"
						>
							Snip
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
					class="mt-12 max-w-2xl text-lg leading-8 text-snip-text-secondary"
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

					<p class="mt-7 text-sm text-snip-text-secondary">
						Drag and drop audio or video, or click to upload
					</p>
				</div>
			</div>
		</section>

		<section class="pb-16 pt-4 sm:pb-20">
			<div
				class="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]"
			>
				<div class="mt-20 space-y-4">

					<h2
						class="max-w-xl text-3xl leading-[1.31] font-semibold tracking-tight text-white sm:text-4xl"
					>
						See snip in action.
					</h2>
					<p
						class="max-w-xl text-base leading-7 text-snip-text-secondary"
					>
						Here is a video of our demo of Snip on YouTube. 
					</p>
				</div>

				<div
					class="rounded-[2rem] border border-snip-border bg-snip-surface p-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)]"
				>
					<div
						class="overflow-hidden rounded-[1.5rem] border border-snip-border bg-black"
					>
						<iframe
							class="aspect-video w-full bg-black"
							src="https://www.youtube.com/embed/egc_p-gaabA"
							title="Snip editor preview"
							loading="lazy"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
							referrerpolicy="strict-origin-when-cross-origin"
							allowfullscreen
						/>
					</div>
					<div class="mt-5 flex items-center justify-between gap-4">
						<div>
							<p class="text-sm font-medium text-white">
								Snip Preview
							</p>
							<p class="mt-1 text-sm text-snip-text-secondary">
								A preview of snip, with all its features.
							</p>
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

<style>
	:global(:root) {
		--snip-cut-y: 10.7rem;
	}

	.snip-cut-scene {
		overflow: visible;
	}

	.snip-cut-layer {
		position: absolute;
		inset: 0;
		will-change: transform, opacity;
	}

	.snip-cut-content {
		position: relative;
		height: 100%;
		width: 100%;
	}

	.snip-cut-layer-static {
		clip-path: inset(0 0 calc(100% - var(--snip-cut-y)) 0);
	}

	.snip-cut-layer-falling {
		clip-path: inset(var(--snip-cut-y) 0 0 0);
		animation: snip-paper-fall 4.2s cubic-bezier(0.2, 0.8, 0.28, 1) infinite;
	}

	.snip-paper-card {
		position: absolute;
		left: 0.25rem;
		top: 0;
		height: 28rem;
		width: 22rem;
		border: 1px solid rgb(255 255 255 / 0.06);
		border-radius: 2.5rem;
		background: linear-gradient(
			145deg,
			rgba(248, 248, 246, 0.96),
			rgba(224, 223, 218, 0.9)
		);
		box-shadow:
			0 28px 80px rgba(0, 0, 0, 0.45),
			inset 0 1px 0 rgba(255, 255, 255, 0.95);
	}

	.snip-cut-copy {
		position: absolute;
		left: 8rem;
		top: calc(var(--snip-cut-y) - 1.6rem);
		margin: 0;
		line-height: 1;
		font-size: 3rem;
		font-weight: 600;
		letter-spacing: -0.04em;
		color: rgb(0 0 0 / 0.7);
	}

	.snip-cut-line {
		position: absolute;
		left: 0;
		top: var(--snip-cut-y);
		width: 21.75rem;
		border-top: 2px dashed rgb(168 85 247 / 0.55);
		opacity: 0.8;
	}

	@keyframes snip-paper-fall {
		0%,
		18% {
			opacity: 1;
			transform: translate3d(0, 0, 0) rotate(0deg);
		}

		58% {
			opacity: 1;
			transform: translate3d(-0.3rem, 10rem, 0) rotate(-5deg);
		}

		72% {
			opacity: 0;
			transform: translate3d(-0.55rem, 16rem, 0) rotate(-8deg);
		}

		100% {
			opacity: 0;
			transform: translate3d(0, 0, 0) rotate(0deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.snip-cut-layer-falling {
			animation: none;
		}
	}
</style>
