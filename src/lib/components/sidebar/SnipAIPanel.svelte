<script lang="ts">
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	const total = $derived(editor.workflowSteps.length);
	const steps = $derived(editor.workflowSteps);
	const doneCount = $derived(steps.filter((s) => s.state === "done").length);
	const fillPct = $derived((doneCount / total) * 100);
</script>

<div class="flex flex-col gap-4 px-4 py-3">
	<span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-snip-text-muted">Snip AI</span>

	<div class="flex items-center gap-2.5">
		{#if editor.isBusy}
			<span class="spinner size-[14px] flex-shrink-0"></span>
		{:else}
			<span class="size-[8px] flex-shrink-0 rounded-full bg-green-500"></span>
		{/if}
		<span class="flex-1 text-[14px] font-semibold leading-none text-white">{editor.statusLabel}</span>
		<span class="font-mono text-[12px] tabular-nums text-snip-text-secondary">
			{doneCount} / {total}
		</span>
	</div>

	<div class="relative h-[2px] w-full overflow-hidden rounded-full bg-[#1f1f1f]">
		<div class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500" style={`width:${fillPct}%`}></div>
		<div class="absolute inset-y-0 left-0 overflow-hidden rounded-full transition-all duration-500" style={`width:${fillPct}%`}>
			<div class="shimmer-track absolute inset-0"></div>
		</div>
	</div>

	<ol class="flex flex-col gap-1">
		{#each steps as step, index (`workflow-step-${index}-${step.label}`)}
			<li class="flex h-9 items-center gap-3">
				{#if step.state === "active"}
					<span class="spinner-sm size-[16px] shrink-0"></span>
				{:else if step.state === "done"}
					<span class="flex size-[16px] shrink-0 items-center justify-center rounded-full bg-green-500/15 text-[11px] font-bold leading-none text-green-400">
						&#10003;
					</span>
				{:else}
					<span class="flex size-[16px] shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] text-[11px] leading-none text-[#333]">
						{index + 1}
					</span>
				{/if}
				<span
					class="text-[13px] font-medium leading-none transition-colors duration-300"
					class:text-white={step.state === "active"}
					class:text-green-400={step.state === "done"}
					class:text-[#444]={step.state === "pending"}
				>
					{step.label}
				</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.spinner {
		border: 2px solid transparent;
		border-top-color: #7c3aed;
		border-right-color: #7c3aed;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.spinner-sm {
		border: 2px solid rgba(124, 58, 237, 0.2);
		border-top-color: #7c3aed;
		border-right-color: #7c3aed;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
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
