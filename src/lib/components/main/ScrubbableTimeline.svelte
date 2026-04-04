<script lang="ts">
	import { onMount } from 'svelte';

	type CutRange = {
		start: number; // seconds
		end: number;   // seconds
		type: 'filler' | 'pause' | 'restart';
	};

	let {
		duration = 120,
		cutRanges = [],
	}: {
		duration?: number;
		cutRanges?: CutRange[];
	} = $props();

	// ── Internal state ────────────────────────────────────────────────
	let playhead = $state(0);
	let playing = $state(false);
	let dragging = $state(false);
	let handleHovered = $state(false);
	let lastTickTime = $state(0);

	// ── DOM refs ──────────────────────────────────────────────────────
	let trackEl: HTMLDivElement;

	// ── Waveform bars ─────────────────────────────────────────────────
	const waveBarHeights = Array.from({ length: 96 }, (_, i) =>
		Math.round(8 + Math.abs(Math.sin(i * 0.31) * 18) + Math.abs(Math.sin(i * 0.73) * 12))
	);

	// ── Time labels ───────────────────────────────────────────────────
	const timeLabels = Array.from({ length: 9 }, (_, i) => {
		const secs = i * 15;
		const m = Math.floor(secs / 60);
		const s = String(secs % 60).padStart(2, '0');
		return `${m}:${s}`;
	});

	// ── Cut region colors ─────────────────────────────────────────────
	const CUT_BORDER: Record<CutRange['type'], string> = {
		filler:  '#f97316',
		pause:   '#3b82f6',
		restart: '#22c55e',
	};
	const CUT_BG: Record<CutRange['type'], string> = {
		filler:  'rgba(249,115,22,0.13)',
		pause:   'rgba(59,130,246,0.13)',
		restart: 'rgba(34,197,94,0.13)',
	};

	// ── Time formatter ────────────────────────────────────────────────
	function fmt(s: number): string {
		const clamped = Math.max(0, Math.min(s, duration));
		const m = Math.floor(clamped / 60);
		const secs = (clamped % 60).toFixed(1).padStart(4, '0');
		return `${m}:${secs}`;
	}

	// ── Derived percentages ───────────────────────────────────────────
	const playheadPct = $derived((playhead / duration) * 100);

	// ── RAF playback loop ─────────────────────────────────────────────
	let rafId = 0;

	function tick() {
		const now = Date.now();
		const delta = (now - lastTickTime) / 1000;
		lastTickTime = now;
		playhead = Math.min(playhead + delta, duration);
		if (playhead >= duration) {
			playing = false;
			playhead = duration;
			return;
		}
		rafId = requestAnimationFrame(tick);
	}

	function startRaf() {
		cancelAnimationFrame(rafId);
		lastTickTime = Date.now();
		rafId = requestAnimationFrame(tick);
	}

	function stopRaf() {
		cancelAnimationFrame(rafId);
	}

	$effect(() => {
		if (playing && !dragging) {
			startRaf();
		} else {
			stopRaf();
		}
		return () => stopRaf();
	});

	onMount(() => {
		return () => stopRaf();
	});

	// ── Seek helpers ──────────────────────────────────────────────────
	function seekTo(secs: number) {
		playhead = Math.max(0, Math.min(secs, duration));
		lastTickTime = Date.now();
	}

	function seekFromEvent(e: MouseEvent) {
		if (!trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
		seekTo((x / rect.width) * duration);
	}

	// ── Drag interaction ──────────────────────────────────────────────
	function handleMouseDown(e: MouseEvent) {
		dragging = true;
		seekFromEvent(e);

		function onMove(ev: MouseEvent) {
			seekFromEvent(ev);
		}

		function onUp() {
			dragging = false;
			if (playing) {
				startRaf();
			}
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		}

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	// ── Play / pause ──────────────────────────────────────────────────
	function togglePlay() {
		if (playhead >= duration) {
			seekTo(0);
		}
		playing = !playing;
	}

	// ── Keyboard shortcuts ────────────────────────────────────────────
	function handleKeyDown(e: KeyboardEvent) {
		// Only act when no text input is focused
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;

		switch (e.code) {
			case 'Space':
				e.preventDefault();
				togglePlay();
				break;
			case 'ArrowLeft':
				seekTo(playhead - 5);
				break;
			case 'ArrowRight':
				seekTo(playhead + 5);
				break;
			case 'KeyJ':
				seekTo(playhead - 10);
				break;
			case 'KeyL':
				seekTo(playhead + 10);
				break;
			case 'KeyK':
				playing = false;
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-col gap-1.5 select-none">

	<!-- ── Time display ────────────────────────────────────────────── -->
	<div class="flex justify-between px-0.5" style="font-size:10px;color:#444;font-family:monospace;">
		<span>{fmt(playhead)}</span>
		<span>{fmt(duration)}</span>
	</div>

	<!-- ── Track ───────────────────────────────────────────────────── -->
	<div
		bind:this={trackEl}
		class="relative h-8 cursor-crosshair overflow-visible"
		onmousedown={handleMouseDown}
		role="slider"
		aria-valuemin={0}
		aria-valuemax={duration}
		aria-valuenow={Math.round(playhead)}
		aria-label="Timeline scrubber"
		tabindex={0}
	>
		<!-- Waveform bars -->
		<div class="absolute inset-0 flex items-end gap-px pointer-events-none">
			{#each waveBarHeights as h}
				<div class="flex-1 rounded-sm bg-[#2a2a2a]" style="height:{h}px"></div>
			{/each}
		</div>

		<!-- Played-region fill -->
		<div
			class="absolute inset-y-0 left-0 pointer-events-none"
			style="width:{playheadPct}%;background:rgba(200,241,53,0.08);"
		></div>

		<!-- Cut range overlays -->
		{#each cutRanges as cut}
			{@const left = (cut.start / duration) * 100}
			{@const width = ((cut.end - cut.start) / duration) * 100}
			<div
				class="absolute inset-y-0 pointer-events-none"
				style="left:{left}%;width:{width}%;background:{CUT_BG[cut.type]};border-left:1px solid {CUT_BORDER[cut.type]};border-right:1px solid {CUT_BORDER[cut.type]};opacity:0.7;"
			></div>
		{/each}

		<!-- Interaction layer (transparent, catches all mouse events) -->
		<div class="absolute inset-0" style="cursor:crosshair;"></div>

		<!-- Playhead line + handle -->
		<div
			class="absolute inset-y-0 pointer-events-none"
			style="left:{playheadPct}%;transform:translateX(-50%);"
		>
			<!-- Vertical line -->
			<div class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style="background:#c8f135;"></div>

			<!-- Circle handle -->
			<div
				class="absolute -top-[5px] left-1/2 rounded-full transition-transform duration-100"
				style="
					width:10px;
					height:10px;
					transform:translateX(-50%) scale({handleHovered || dragging ? 1.3 : 1});
					background:#c8f135;
					box-shadow:0 0 6px rgba(200,241,53,0.7);
				"
				onmouseenter={() => (handleHovered = true)}
				onmouseleave={() => (handleHovered = false)}
			></div>

			<!-- Drag tooltip -->
			{#if dragging}
				<div
					class="absolute pointer-events-none whitespace-nowrap"
					style="
						bottom:calc(100% + 10px);
						left:50%;
						transform:translateX(-50%);
						background:#1a1a1a;
						border:1px solid #2a2a2a;
						border-radius:4px;
						padding:2px 6px;
						font-size:10px;
						font-family:monospace;
						color:#c8f135;
					"
				>
					{fmt(playhead)}
				</div>
			{/if}
		</div>
	</div>

	<!-- ── Time markers ────────────────────────────────────────────── -->
	<div class="flex justify-between px-0.5">
		{#each timeLabels as t}
			<span style="font-size:9px;color:#3f3f46;font-family:monospace;">{t}</span>
		{/each}
	</div>

	<!-- ── Controls row ─────────────────────────────────────────────── -->
	<div class="flex items-center justify-center gap-2 pt-1">
		<!-- ← 5s -->
		<button
			onclick={() => seekTo(playhead - 5)}
			class="flex items-center gap-1 px-2.5 py-1 rounded text-[#888] transition-colors hover:text-[#c8f135] hover:border-[#3f3f46]"
			style="background:#1a1a1a;border:1px solid #2a2a2a;font-size:11px;font-family:monospace;border-radius:4px;"
			aria-label="Seek back 5 seconds"
		>
			← 5s
		</button>

		<!-- Play / Pause -->
		<button
			onclick={togglePlay}
			class="flex items-center justify-center rounded-full transition-colors hover:opacity-80 active:scale-95"
			style="width:32px;height:32px;background:#c8f135;border:none;cursor:pointer;"
			aria-label={playing ? 'Pause' : 'Play'}
		>
			{#if playing}
				<!-- Pause icon -->
				<svg width="10" height="12" viewBox="0 0 10 12" fill="none">
					<rect x="0" y="0" width="3" height="12" rx="1" fill="#0d0d0d"/>
					<rect x="7" y="0" width="3" height="12" rx="1" fill="#0d0d0d"/>
				</svg>
			{:else}
				<!-- Play icon -->
				<svg width="10" height="12" viewBox="0 0 10 12" fill="none">
					<path d="M0 0.5L10 6L0 11.5V0.5Z" fill="#0d0d0d"/>
				</svg>
			{/if}
		</button>

		<!-- 5s → -->
		<button
			onclick={() => seekTo(playhead + 5)}
			class="flex items-center gap-1 px-2.5 py-1 rounded text-[#888] transition-colors hover:text-[#c8f135] hover:border-[#3f3f46]"
			style="background:#1a1a1a;border:1px solid #2a2a2a;font-size:11px;font-family:monospace;border-radius:4px;"
			aria-label="Seek forward 5 seconds"
		>
			5s →
		</button>
	</div>

</div>
