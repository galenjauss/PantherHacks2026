<script lang="ts">
	import { browser } from "$app/environment";
	import { untrack } from "svelte";

	let {
		value,
		duration = 800,
		format
	}: {
		value: number;
		duration?: number;
		format: (n: number) => string;
	} = $props();

	let displayed = $state(0);
	let initialized = false;
	let rafId: number | null = null;

	const reducedMotion = browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	$effect(() => {
		const target = value;

		if (!initialized) {
			displayed = target;
			initialized = true;
			return;
		}

		if (reducedMotion || !browser) {
			displayed = target;
			return;
		}

		const start = untrack(() => displayed);
		const delta = target - start;
		if (Math.abs(delta) < 0.001) return;

		const startTime = performance.now();

		if (rafId !== null) cancelAnimationFrame(rafId);

		function tick(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);
			displayed = start + delta * eased;

			if (progress < 1) {
				rafId = requestAnimationFrame(tick);
			} else {
				displayed = target;
				rafId = null;
			}
		}

		rafId = requestAnimationFrame(tick);

		return () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
		};
	});
</script>

<span>{format(displayed)}</span>
