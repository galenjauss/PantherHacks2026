<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { videoEditorState as editor } from '$lib/stores/video-editor.svelte';

	let isActivating = $state(false);
	let inputRef = $state<HTMLInputElement | null>(null);
	let activationTimeout: ReturnType<typeof setTimeout> | null = null;

	function clearActivationTimeout() {
		if (!activationTimeout) return;
		clearTimeout(activationTimeout);
		activationTimeout = null;
	}

	function handleAddVideosClick() {
		clearActivationTimeout();
		isActivating = true;
		inputRef?.click();
		activationTimeout = setTimeout(() => {
			isActivating = false;
			activationTimeout = null;
		}, 1500);
	}

	async function handleFileSelection(files: FileList | null) {
		const file = files?.[0] ?? null;
		clearActivationTimeout();

		if (!file) {
			isActivating = false;
			return;
		}

		await editor.setFile(file);
		isActivating = false;
		await goto('/video-editor');
	}

	onMount(() => {
		const handleWindowFocus = () => {
			if (!isActivating) return;

			window.setTimeout(() => {
				if (isActivating) {
					clearActivationTimeout();
					isActivating = false;
				}
			}, 300);
		};

		window.addEventListener('focus', handleWindowFocus);

		return () => {
			clearActivationTimeout();
			window.removeEventListener('focus', handleWindowFocus);
		};
	});
</script>

<svelte:head>
	<title>PantherHacks Editor</title>
	<meta
		name="description"
		content="A title screen for transcript-aware video cleanup with room for a wide add-video action."
	/>
</svelte:head>

<div
	class="relative flex min-h-svh flex-col overflow-hidden bg-background px-4 py-4 text-foreground sm:px-5"
>
	<div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background"></div>
	<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:42px_42px] opacity-25"></div>
	<div class="pointer-events-none absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/12 blur-3xl"></div>

	<header class="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
		<div
			class="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3.5 py-1.5 text-[0.72rem] font-medium uppercase tracking-[0.24em] text-muted-foreground"
		>
			<span class="h-2.5 w-2.5 rounded-full bg-primary"></span>
			PantherHacks Editor
		</div>

		<div
			class="inline-flex items-center rounded-full border border-border/50 bg-background/80 px-3.5 py-1.5 text-[0.72rem] font-medium uppercase tracking-[0.24em] text-muted-foreground"
		>
			Processing-ready
		</div>
	</header>

	<main class="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center py-6">
		<div class="relative flex w-full max-w-3xl items-center justify-center px-6 py-8 text-center sm:px-10 lg:px-14">
			<div class="max-w-xl">
				<p class="mb-5 text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
					Transcript-aware cleanup
				</p>

				<h1
					class="text-5xl leading-none font-semibold tracking-tight text-foreground sm:text-6xl md:text-7xl"
				>
					TITLE
					<br />
					HEADER
				</h1>

				<p class="mx-auto mt-6 max-w-md text-base leading-7 text-muted-foreground">
					Find stutters, awkward phrasing, and bad takes from the transcript before you start
					cutting.
				</p>
			</div>
		</div>
	</main>

	<div class="relative z-10 mx-auto w-full max-w-6xl pb-1">
		<Input
			bind:ref={inputRef}
			type="file"
			accept="video/*"
			class="hidden"
			onchange={(event) => handleFileSelection((event.currentTarget as HTMLInputElement).files)}
		/>

		<Button
			size="lg"
			onclick={handleAddVideosClick}
			class={`group relative h-16 w-full overflow-hidden rounded-[1.45rem] border border-primary/20 text-base font-semibold text-primary-foreground shadow-lg transition-all duration-300 ${
				isActivating
					? 'scale-[0.995] cursor-progress bg-primary/95 shadow-[0_18px_50px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]'
					: 'cursor-pointer bg-primary shadow-[0_12px_38px_color-mix(in_oklab,var(--color-primary)_28%,transparent)] hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_18px_50px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]'
			}`}
		>
			<span class="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary opacity-100"></span>
			<span class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18),transparent_55%)]"></span>
			<span class="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/45"></span>
			<span class="relative z-[1] flex items-center justify-center gap-3">
				<span class="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15 text-lg leading-none transition-transform duration-300 group-hover:scale-110">
					+
				</span>
				<span>{isActivating ? 'Preparing upload...' : 'Add Videos'}</span>
			</span>
		</Button>
	</div>
</div>
