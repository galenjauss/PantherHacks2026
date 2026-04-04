<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
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
			class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground shadow-sm"
		>
			<span class="h-2.5 w-2.5 rounded-full bg-primary"></span>
			PantherHacks Editor
		</div>

		<div
			class="inline-flex items-center rounded-full border border-border/60 bg-card px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground shadow-sm"
		>
			Processing-ready
		</div>
	</header>

	<main class="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center py-6">
		<Card
			class="relative flex min-h-[26rem] w-full max-w-4xl overflow-hidden rounded-[2rem] border-border/60 bg-card p-0 shadow-xl"
		>
			<div class="absolute inset-0 bg-gradient-to-b from-background/40 via-card to-card"></div>

			<div class="relative flex w-full items-center justify-center px-6 py-8 text-center sm:px-10 lg:px-14">
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

			<div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-border/60"></div>
		</Card>
	</main>

	<div class="relative z-10 mx-auto w-full max-w-6xl pb-1">
		<Button
			size="lg"
			class="h-14 w-full rounded-[1.35rem] border-border/60 bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
		>
			<span class="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15 text-lg leading-none">
				+
			</span>
			Add Videos
		</Button>
	</div>
</div>
