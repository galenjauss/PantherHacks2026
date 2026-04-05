<script lang="ts">
	import { Switch } from "$lib/components/ui/switch";
	import { Slider } from "$lib/components/ui/slider";
	import * as Select from "$lib/components/ui/select";
	import { videoEditorState as editor } from "$lib/stores/video-editor.svelte";
	import type { VideoSubtitleVerticalAlign } from "$lib/video/subtitles";
	import {
		BUNDLED_VIDEO_SUBTITLE_FONT_FAMILIES,
		VIDEO_SUBTITLE_FONT_FAMILIES
	} from "$lib/video/subtitle-fonts";

	const VERTICAL_POSITIONS: { value: VideoSubtitleVerticalAlign; label: string }[] = [
		{ value: "top", label: "Top" },
		{ value: "middle", label: "Middle" },
		{ value: "bottom", label: "Bottom" }
	];

	function updateStyle<K extends keyof typeof editor.subtitleStyle>(
		key: K,
		value: (typeof editor.subtitleStyle)[K]
	) {
		editor.subtitleStyle = { ...editor.subtitleStyle, [key]: value };
	}

	function updatePosition<K extends keyof typeof editor.subtitleStyle.position>(
		key: K,
		value: (typeof editor.subtitleStyle.position)[K]
	) {
		editor.subtitleStyle = {
			...editor.subtitleStyle,
			position: { ...editor.subtitleStyle.position, [key]: value }
		};
	}
</script>

<div
	class="flex flex-col gap-0.5 overflow-y-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
	<!-- Enable/Disable -->
	<div class="flex items-center justify-between py-1">
		<p class="font-display text-[12px] font-semibold text-snip-text-primary">
			Show subtitles
		</p>
		<Switch
			checked={editor.subtitleStyle.enabled}
			onCheckedChange={(v) => updateStyle("enabled", v)}
		/>
	</div>

	{#if editor.subtitleStyle.enabled}
		<div class="mt-2 border-t border-snip-border"></div>

		<!-- Position -->
		<div class="mt-3 space-y-3">
			<p class="font-display text-[11px] font-semibold uppercase tracking-wider text-snip-text-muted">
				Position
			</p>

			<div class="flex items-center justify-between gap-3">
				<p class="text-[12px] text-snip-text-secondary">Vertical</p>
				<Select.Root
					type="single"
					value={editor.subtitleStyle.position.verticalAlign}
					onValueChange={(v) => {
						if (v) updatePosition("verticalAlign", v as VideoSubtitleVerticalAlign);
					}}
				>
					<Select.Trigger
						class="h-7 w-[100px] rounded-md border border-snip-border bg-snip-border px-2 text-[11px] text-snip-text-primary"
					>
						{VERTICAL_POSITIONS.find((p) => p.value === editor.subtitleStyle.position.verticalAlign)?.label ?? "Bottom"}
					</Select.Trigger>
					<Select.Content class="border-snip-border bg-snip-surface-elevated text-snip-text-primary">
						{#each VERTICAL_POSITIONS as pos (pos.value)}
							<Select.Item value={pos.value} class="text-[11px] text-snip-text-primary hover:bg-snip-border">{pos.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<p class="text-[12px] text-snip-text-secondary">Margin</p>
					<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[2px] font-mono text-[11px] text-snip-text-secondary">
						{editor.subtitleStyle.position.marginYPct}%
					</span>
				</div>
				<div class="slider-dark">
					<Slider
						type="single"
						value={editor.subtitleStyle.position.marginYPct}
						onValueChange={(v) => updatePosition("marginYPct", v)}
						min={0}
						max={30}
						step={1}
					/>
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<p class="text-[12px] text-snip-text-secondary">Max width</p>
					<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[2px] font-mono text-[11px] text-snip-text-secondary">
						{editor.subtitleStyle.maxWidthPct}%
					</span>
				</div>
				<div class="slider-dark">
					<Slider
						type="single"
						value={editor.subtitleStyle.maxWidthPct}
						onValueChange={(v) => updateStyle("maxWidthPct", v)}
						min={42}
						max={92}
						step={1}
					/>
				</div>
			</div>
		</div>

		<div class="mt-3 border-t border-snip-border"></div>

		<!-- Font -->
		<div class="mt-3 space-y-3">
			<p class="font-display text-[11px] font-semibold uppercase tracking-wider text-snip-text-muted">
				Font
			</p>

			<div class="flex items-center justify-between gap-3">
				<p class="text-[12px] text-snip-text-secondary">Family</p>
				<Select.Root
					type="single"
					value={editor.subtitleStyle.fontFamily}
					onValueChange={(v) => {
						if (v) updateStyle("fontFamily", v);
					}}
				>
					<Select.Trigger
						class="h-7 w-[130px] truncate rounded-md border border-snip-border bg-snip-border px-2 text-[11px] text-snip-text-primary"
					>
						{editor.subtitleStyle.fontFamily}
					</Select.Trigger>
					<Select.Content class="border-snip-border bg-snip-surface-elevated text-snip-text-primary">
						{#each VIDEO_SUBTITLE_FONT_FAMILIES as font (font)}
							<Select.Item value={font} class="text-[11px] text-snip-text-primary hover:bg-snip-border" style="font-family: {font};">{font}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<p class="text-[11px] leading-relaxed text-snip-text-muted">
				Bundled for server export: {BUNDLED_VIDEO_SUBTITLE_FONT_FAMILIES.join(", ")}.
				Other system fonts depend on the render host.
			</p>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<p class="text-[12px] text-snip-text-secondary">Size</p>
					<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[2px] font-mono text-[11px] text-snip-text-secondary">
						{editor.subtitleStyle.fontSizePctOfHeight.toFixed(1)}%
					</span>
				</div>
				<div class="slider-dark">
					<Slider
						type="single"
						value={editor.subtitleStyle.fontSizePctOfHeight}
						onValueChange={(v) => updateStyle("fontSizePctOfHeight", v)}
						min={2.2}
						max={8.5}
						step={0.1}
					/>
				</div>
			</div>

			<div class="flex items-center justify-between py-0.5">
				<p class="text-[12px] text-snip-text-secondary">Bold</p>
				<Switch
					checked={editor.subtitleStyle.bold}
					onCheckedChange={(v) => updateStyle("bold", v)}
				/>
			</div>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<p class="text-[12px] text-snip-text-secondary">Line height</p>
					<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[2px] font-mono text-[11px] text-snip-text-secondary">
						{editor.subtitleStyle.lineHeight.toFixed(2)}
					</span>
				</div>
				<div class="slider-dark">
					<Slider
						type="single"
						value={editor.subtitleStyle.lineHeight}
						onValueChange={(v) => updateStyle("lineHeight", v)}
						min={0.8}
						max={2.0}
						step={0.02}
					/>
				</div>
			</div>
		</div>

		<div class="mt-3 border-t border-snip-border"></div>

		<!-- Colors -->
		<div class="mt-3 space-y-3">
			<p class="font-display text-[11px] font-semibold uppercase tracking-wider text-snip-text-muted">
				Colors
			</p>

			<div class="flex items-center justify-between">
				<p class="text-[12px] text-snip-text-secondary">Text</p>
				<input
					type="color"
					value={editor.subtitleStyle.textColor}
					oninput={(e) => updateStyle("textColor", e.currentTarget.value)}
					class="h-7 w-10 cursor-pointer rounded border border-snip-border bg-transparent"
				/>
			</div>

			<div class="flex items-center justify-between">
				<p class="text-[12px] text-snip-text-secondary">Active word</p>
				<input
					type="color"
					value={editor.subtitleStyle.activeWordColor}
					oninput={(e) => updateStyle("activeWordColor", e.currentTarget.value)}
					class="h-7 w-10 cursor-pointer rounded border border-snip-border bg-transparent"
				/>
			</div>
		</div>

		<div class="mt-3 border-t border-snip-border"></div>

		<!-- Background -->
		<div class="mt-3 space-y-3">
			<p class="font-display text-[11px] font-semibold uppercase tracking-wider text-snip-text-muted">
				Background
			</p>

			<div class="flex items-center justify-between">
				<p class="text-[12px] text-snip-text-secondary">Color</p>
				<input
					type="color"
					value={editor.subtitleStyle.bgColor}
					oninput={(e) => updateStyle("bgColor", e.currentTarget.value)}
					class="h-7 w-10 cursor-pointer rounded border border-snip-border bg-transparent"
				/>
			</div>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<p class="text-[12px] text-snip-text-secondary">Opacity</p>
					<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[2px] font-mono text-[11px] text-snip-text-secondary">
						{Math.round(editor.subtitleStyle.bgOpacity * 100)}%
					</span>
				</div>
				<div class="slider-dark">
					<Slider
						type="single"
						value={editor.subtitleStyle.bgOpacity}
						onValueChange={(v) => updateStyle("bgOpacity", v)}
						min={0}
						max={1}
						step={0.01}
					/>
				</div>
			</div>
		</div>

		<div class="mt-3 border-t border-snip-border"></div>

		<!-- Outline -->
		<div class="mt-3 space-y-3">
			<p class="font-display text-[11px] font-semibold uppercase tracking-wider text-snip-text-muted">
				Outline
			</p>

			<div class="flex items-center justify-between">
				<p class="text-[12px] text-snip-text-secondary">Color</p>
				<input
					type="color"
					value={editor.subtitleStyle.outlineColor}
					oninput={(e) => updateStyle("outlineColor", e.currentTarget.value)}
					class="h-7 w-10 cursor-pointer rounded border border-snip-border bg-transparent"
				/>
			</div>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<p class="text-[12px] text-snip-text-secondary">Thickness</p>
					<span class="rounded-full border border-snip-border bg-snip-surface-elevated px-2 py-[2px] font-mono text-[11px] text-snip-text-secondary">
						{editor.subtitleStyle.outlineThickness.toFixed(1)}
					</span>
				</div>
				<div class="slider-dark">
					<Slider
						type="single"
						value={editor.subtitleStyle.outlineThickness}
						onValueChange={(v) => updateStyle("outlineThickness", v)}
						min={0}
						max={8}
						step={0.1}
					/>
				</div>
			</div>
		</div>
	{/if}
</div>
