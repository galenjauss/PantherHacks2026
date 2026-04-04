<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { videoEditorState as editor } from '$lib/stores/video-editor.svelte';

	import UploadIcon from '@lucide/svelte/icons/upload';
	import WandSparklesIcon from '@lucide/svelte/icons/wand-sparkles';

	let isActivating = $state(false);
	let isDragging = $state(false);
	let inputRef = $state<HTMLInputElement | null>(null);
	let activationTimeout: ReturnType<typeof setTimeout> | null = null;

	const navItems = ['How it works', 'Examples', 'Results preview'];

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
		if (nextTarget && event.currentTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
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
		await goto('/video-editor');
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

<div class="dark h-svh overflow-hidden bg-snip-bg text-snip-text-primary">
	<div class="mx-auto grid h-full w-full max-w-7xl grid-rows-[auto_1fr] px-4 py-4 sm:px-5 lg:px-8">
		<header class="flex items-center justify-between gap-6 rounded-full border border-snip-border bg-snip-surface px-4 py-3">
			<div class="flex items-center gap-3">
				<div class="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
					<WandSparklesIcon class="size-5" />
				</div>
				<div>
					<p class="text-sm font-semibold tracking-[0.18em] text-white uppercase">Snip</p>
					<p class="text-xs text-snip-text-secondary">Transcript-first cleanup</p>
				</div>
			</div>

			<nav class="hidden items-center gap-1 md:flex">
				{#each navItems as item}
					<button
						type="button"
						class="rounded-full px-4 py-2 text-sm text-snip-text-secondary transition-colors hover:text-white"
					>
						{item}
					</button>
				{/each}
			</nav>

			<div class="w-10 md:hidden"></div>
		</header>

		<main class="flex min-h-0 items-center justify-center">
			<div class="flex w-full max-w-4xl flex-col items-center text-center">
				<p class="mb-5 text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
					Audio + video upload
				</p>

				<h1 class="max-w-4xl text-5xl leading-[0.94] font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
					Upload a clip.
					<br />
					Get the timestamps.
					<br />
					Cut the awkward parts faster.
				</h1>

				<p class="mt-6 max-w-2xl text-lg leading-8 text-snip-text-secondary">
					Snip reads the transcript, marks filler words, long pauses, and retakes, then
					surfaces exact timestamps so you can jump straight into cleanup.
				</p>

				<div class="mt-10 flex w-full max-w-2xl flex-col items-center">
					<div
						role="button"
						tabindex="0"
						aria-label="Upload audio or video"
						class={`w-full rounded-[1.75rem] border border-dashed bg-snip-surface px-4 py-4 transition-all duration-200 ${
							isDragging
								? 'border-primary/70 shadow-[0_0_0_1px_rgba(124,58,237,0.25)]'
								: isActivating
									? 'cursor-progress border-primary/60'
									: 'cursor-pointer border-snip-border hover:border-white/25'
						}`}
						onclick={handleUploadClick}
						onkeydown={(event) => event.key === 'Enter' || event.key === ' ' ? handleUploadClick() : null}
						ondragenter={handleDragEnter}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDroppedFiles}
					>
						<Button
							size="lg"
							class={`h-14 w-full rounded-[1.2rem] border bg-snip-surface-elevated px-6 text-base font-semibold text-white transition-all duration-200 ${
								isDragging
									? 'border-primary/70'
									: isActivating
										? 'cursor-progress border-primary/60'
										: 'border-snip-border hover:border-white/25'
							}`}
						>
							<span class="flex items-center gap-3">
								<span class="grid size-7 place-items-center rounded-full border border-white/10 bg-snip-surface text-snip-text-secondary">
									<UploadIcon class="size-4" />
								</span>
								{isActivating ? 'Preparing upload...' : 'Upload media'}
							</span>
						</Button>
					</div>

					<p class="mt-4 text-sm text-snip-text-secondary">
						Drag and drop audio or video, or click to upload
					</p>
				</div>
			</div>
		</main>

		<Input
			bind:ref={inputRef}
			type="file"
			accept="video/*,audio/*"
			class="hidden"
			onchange={(event) => handleFileSelection((event.currentTarget as HTMLInputElement).files)}
		/>
	</div>
</div>
