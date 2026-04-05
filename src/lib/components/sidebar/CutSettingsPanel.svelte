<script lang="ts">
	import { onDestroy } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { Switch } from "$lib/components/ui/switch";
	import { Slider } from "$lib/components/ui/slider";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";

	const SLIDER_DEBOUNCE_MS = 180;

	const rows = [
		{
			key: "filler_words",
			color: "#ef4444",
			label: "filler words",
			description: (count: number) => `${count} detected segments`,
		},
		{
			key: "dead_space",
			color: "#6b7280",
			label: "dead pauses",
			description: (count: number) =>
				`${count} gaps above the current threshold`,
		},
		{
			key: "retake",
			color: "#3b82f6",
			label: "alternate variants",
			description: (count: number) =>
				`${count} locked semantic alternates or discarded fragments`,
		},
	] as const;

	function getCount(key: (typeof rows)[number]["key"]): number {
		return (
			editor.analysisStats.find((item) => item.category === key)?.count ??
			0
		);
	}

	let deadSpaceThresholdDraft = $state(editor.deadSpaceThreshold);
	let clipEndTrimDraft = $state(editor.clipEndTrim);
	let copiedState = $state<"idle" | "copied" | "error">("idle");

	let deadSpaceThresholdTimeout: ReturnType<typeof setTimeout> | null = null;
	let clipEndTrimTimeout: ReturnType<typeof setTimeout> | null = null;
	let copyResetTimeout: ReturnType<typeof setTimeout> | null = null;

	function scheduleDeadSpaceThresholdCommit(value: number) {
		if (deadSpaceThresholdTimeout) {
			clearTimeout(deadSpaceThresholdTimeout);
		}

		deadSpaceThresholdTimeout = setTimeout(() => {
			editor.deadSpaceThreshold = value;
			deadSpaceThresholdTimeout = null;
		}, SLIDER_DEBOUNCE_MS);
	}

	function commitDeadSpaceThreshold(value: number) {
		if (deadSpaceThresholdTimeout) {
			clearTimeout(deadSpaceThresholdTimeout);
			deadSpaceThresholdTimeout = null;
		}

		editor.deadSpaceThreshold = value;
	}

	function scheduleClipEndTrimCommit(value: number) {
		if (clipEndTrimTimeout) {
			clearTimeout(clipEndTrimTimeout);
		}

		clipEndTrimTimeout = setTimeout(() => {
			editor.clipEndTrim = value;
			clipEndTrimTimeout = null;
		}, SLIDER_DEBOUNCE_MS);
	}

	function commitClipEndTrim(value: number) {
		if (clipEndTrimTimeout) {
			clearTimeout(clipEndTrimTimeout);
			clipEndTrimTimeout = null;
		}

		editor.clipEndTrim = value;
	}

	async function copyLLMJson() {
		if (!editor.hasDebugExport) return;

		try {
			await navigator.clipboard.writeText(editor.debugExportJson);
			copiedState = "copied";
		} catch {
			copiedState = "error";
		}

		if (copyResetTimeout) {
			clearTimeout(copyResetTimeout);
		}

		copyResetTimeout = setTimeout(() => {
			copiedState = "idle";
			copyResetTimeout = null;
		}, 1800);
	}

	onDestroy(() => {
		if (deadSpaceThresholdTimeout) {
			clearTimeout(deadSpaceThresholdTimeout);
		}

		if (clipEndTrimTimeout) {
			clearTimeout(clipEndTrimTimeout);
		}

		if (copyResetTimeout) {
			clearTimeout(copyResetTimeout);
		}
	});
</script>

<div
	class="flex flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
	<!-- Summary bar -->
	<div class="flex items-center justify-between px-4 py-3">
		<p class="text-[12px] text-snip-text-secondary">
			{editor.selectedCutCount} cuts ·
			<span class="font-medium text-primary"
				>−{editor.formatDuration(editor.selectedCutDurationMs)}</span
			>
		</p>
	</div>

	<div class="border-t border-snip-border"></div>

	<div class="px-4 py-3">
		<div
			class="flex items-center justify-between gap-3 rounded-xl border border-snip-border bg-snip-surface-elevated px-3 py-2.5"
		>
			<div class="min-w-0">
				<p class="text-[12px] font-medium text-snip-text-primary">
					Debug export JSON
				</p>
				<p class="text-[11px] text-snip-text-muted">
					Transcript, raw LLM output, labels, line/slot summaries,
					chunks, selections, and derived segments.
				</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				class="border-snip-border bg-snip-surface text-snip-text-primary hover:bg-snip-surface-elevated"
				disabled={!editor.hasDebugExport}
				onclick={() => void copyLLMJson()}
			>
				{copiedState === "copied"
					? "Copied"
					: copiedState === "error"
						? "Copy failed"
						: "Copy debug JSON"}
			</Button>
		</div>
	</div>

	<div class="border-t border-snip-border"></div>

	<!-- Cut categories -->
	<div class="flex flex-col">
		{#each rows as row, index (row.key)}
			<div
				class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-snip-surface-elevated"
			>
				<span
					class="mt-px size-[6px] shrink-0 self-start rounded-full"
					style={`background:${row.color}`}
				></span>
				<div class="min-w-0 flex-1">
					<p
						class="font-display text-[13px] font-semibold leading-[1.3] text-white"
					>
						{row.label}
					</p>
					<p
						class="mt-px text-[11px] leading-[1.4] text-snip-text-secondary"
					>
						{row.description(getCount(row.key))}
					</p>
				</div>
				<Switch
					size="sm"
					class="shrink-0"
					checked={editor.cutToggles[row.key]}
					disabled={row.key === "retake"}
					onCheckedChange={(value: boolean) => {
						if (row.key === "retake") return;
						editor.cutToggles = {
							...editor.cutToggles,
							[row.key]: value,
						};
					}}
				/>
			</div>

			{#if index < rows.length - 1}
				<div class="mx-4 border-t border-[#1e1e1e]"></div>
			{/if}
		{/each}
	</div>

	<div class="mt-1 border-t border-snip-border"></div>

	<!-- Thresholds -->
	<div class="flex flex-col gap-4 px-4 py-4">
		<div class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<p
						class="font-display text-[12px] font-semibold text-snip-text-primary"
					>
						Min pause length
					</p>
					<p class="text-[11px] text-snip-text-muted">
						Rebuilds pause chunks and silence cuts without rerunning
						the LLM.
					</p>
				</div>
				<span
					class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[3px] font-mono text-[11px] text-snip-text-secondary"
				>
					{deadSpaceThresholdDraft} ms
				</span>
			</div>

			<div class="slider-dark">
				<Slider
					type="single"
					value={deadSpaceThresholdDraft}
					onValueChange={(value) => {
						deadSpaceThresholdDraft = value;
						scheduleDeadSpaceThresholdCommit(value);
					}}
					onValueCommit={commitDeadSpaceThreshold}
					min={0}
					max={2000}
					step={25}
				/>
				<div
					class="mt-1 flex justify-between text-[10px] text-snip-text-muted"
				>
					<span>Tight</span>
					<span>Relaxed</span>
				</div>
			</div>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<p
						class="font-display text-[12px] font-semibold text-snip-text-primary"
					>
						Tail trim
					</p>
					<p class="text-[11px] text-snip-text-muted">
						Trim from the end of each kept clip.
					</p>
				</div>
				<span
					class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[3px] font-mono text-[11px] text-snip-text-secondary"
				>
					{clipEndTrimDraft} ms
				</span>
			</div>

			<div class="slider-dark">
				<Slider
					type="single"
					value={clipEndTrimDraft}
					onValueChange={(value) => {
						clipEndTrimDraft = value;
						scheduleClipEndTrimCommit(value);
					}}
					onValueCommit={commitClipEndTrim}
					min={0}
					max={1000}
					step={25}
				/>
				<div
					class="mt-1 flex justify-between text-[10px] text-snip-text-muted"
				>
					<span>None</span>
					<span>More</span>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.slider-dark :global([data-slot="slider-track"]) {
		background-color: #222222;
		height: 4px;
	}

	.slider-dark :global([data-slot="slider-range"]) {
		background-color: #7c3aed;
	}

	.slider-dark :global([data-slot="slider-thumb"]) {
		width: 14px;
		height: 14px;
		border-color: #7c3aed;
		background-color: #7c3aed;
		box-shadow: 0 0 0 2px #111111;
	}

	.slider-dark :global([data-slot="slider-thumb"]:hover),
	.slider-dark :global([data-slot="slider-thumb"]:focus-visible) {
		box-shadow:
			0 0 0 2px #111111,
			0 0 0 4px #7c3aed55;
	}
</style>
