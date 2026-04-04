<script lang="ts">
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	const stepDefs = [
		"uploaded & validated format",
		"transcribing audio via AssemblyAI",
		"classifying filler words & pauses",
		"syncing the autocut job",
		"clean preview ready"
	];

	const total = stepDefs.length;

	const steps = $derived(
		stepDefs.map((label, index) => {
			const number = index + 1;
			const state =
				editor.workflowStep > total || number < editor.workflowStep
					? "done"
					: number === editor.workflowStep
						? "active"
						: "pending";

			return {
				label,
				state,
				glyph: state === "done" ? "✓" : state === "active" ? "•" : "—"
			} as const;
		})
	);

	const fillPct = $derived((Math.min(Math.max(editor.workflowStep - 1, 0), total) / total) * 100);
	const glyphColor = { done: "#22c55e", active: "#7c3aed", pending: "#3f3f46" };
	const labelColor = { done: "#6b7280", active: "#f5f5f5", pending: "#3f3f46" };
</script>

<div class="flex flex-col gap-3 px-4 py-3">
	<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">Snip AI</span>

	<div class="flex items-center gap-2">
		<span class="pulse-dot size-[7px] flex-shrink-0 rounded-full bg-primary"></span>
		<span class="flex-1 text-[13px] font-medium leading-none text-white">{editor.statusLabel}</span>
		<span class="font-mono text-[12px] tabular-nums text-snip-text-secondary">
			{Math.min(Math.max(editor.workflowStep, 1), total)} / {total}
		</span>
	</div>

	<div class="relative h-[2px] w-full overflow-hidden rounded-full bg-[#1f1f1f]">
		<div class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500" style={`width:${fillPct}%`}></div>
		<div class="absolute inset-y-0 left-0 overflow-hidden rounded-full transition-all duration-500" style={`width:${fillPct}%`}>
			<div class="shimmer-track absolute inset-0"></div>
		</div>
	</div>

	<ol class="flex flex-col gap-0">
		{#each steps as step}
			<li class="flex h-7 items-center gap-2.5">
				<span
					class={`w-3 flex-shrink-0 text-center text-[12px] font-bold leading-none ${step.state === "active" ? "active-glyph" : ""}`}
					style={`color:${glyphColor[step.state]}`}
				>
					{step.glyph}
				</span>
				<span class="truncate text-[12px] leading-none" style={`color:${labelColor[step.state]}`}>
					{step.label}
				</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.pulse-dot {
		animation: dot-pulse 1.5s ease-in-out infinite;
	}

	.active-glyph {
		animation: glyph-pulse 1.5s ease-in-out infinite;
	}

	@keyframes dot-pulse {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(0.8);
		}

		50% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes glyph-pulse {
		0%,
		100% {
			opacity: 0.4;
		}

		50% {
			opacity: 1;
		}
	}

	.shimmer-track {
		background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.25) 50%, transparent 100%);
		animation: shimmer-slide 1.8s ease-in-out infinite;
		transform: translateX(-100%);
	}

	@keyframes shimmer-slide {
		0% {
			transform: translateX(-100%);
		}

		100% {
			transform: translateX(400%);
		}
	}
</style>
