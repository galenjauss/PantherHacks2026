<script lang="ts">
	import { tick } from 'svelte';

	export interface Word {
		id: number;
		text: string;
		start: number;
		end: number;
		cut: 'filler' | 'pause' | 'restart' | null;
		keep: boolean;
		lineLabel?: string | null;
		slotLabel?: string | null;
		playOrder?: number | null;
		showPlayMarker?: boolean;
	}

	type PlainToken = { type: 'plain'; word: Word };
	type ChipToken = {
		type: 'chip';
		words: Word[];
		cutType: 'filler' | 'pause' | 'restart';
	};
	type MarkerToken = {
		type: 'marker';
		wordId: number;
		lineLabel: string | null;
		slotLabel: string | null;
		playOrder: number;
	};
	type Token = PlainToken | ChipToken | MarkerToken;

	let {
		words,
		activeWordId = null,
		isPlaying,
		onToggleGroup,
		onSeek,
	}: {
		words: Word[];
		activeWordId: number | null;
		isPlaying: boolean;
		onToggleGroup: (ids: number[]) => void;
		onSeek: (seconds: number) => void;
	} = $props();

	// ── Cut type palette ──────────────────────────────────────────────────────
	const CUT_RGB: Record<string, string> = {
		filler:  '128,138,150',
		pause:   '239,68,68',
		restart: '128,138,150',
	};

	const CUT_LABEL: Record<string, string> = {
		filler:  'filler word',
		pause:   'dead pause',
		restart: 'false start',
	};

	// ── Token grouping ────────────────────────────────────────────────────────
	// Consecutive cut words of the same type collapse into a single chip.
	// A run breaks on any cut-type change or any non-cut (null) word.
	const tokens = $derived.by((): Token[] => {
		const result: Token[] = [];
		let i = 0;
		while (i < words.length) {
			const w = words[i];
			if (w.showPlayMarker && typeof w.playOrder === 'number') {
				result.push({
					type: 'marker',
					wordId: w.id,
					lineLabel: w.lineLabel ?? null,
					slotLabel: w.slotLabel ?? null,
					playOrder: w.playOrder,
				});
			}
			if (w.cut !== null) {
				const cutType = w.cut;
				const run: Word[] = [w];
				let j = i + 1;
				while (j < words.length && words[j].cut === cutType) {
					run.push(words[j]);
					j++;
				}
				result.push({ type: 'chip', words: run, cutType });
				i = j;
			} else {
				result.push({ type: 'plain', word: w });
				i++;
			}
		}
		return result;
	});

	// ── Stats ─────────────────────────────────────────────────────────────────
	const totalCutSecs = $derived(
		words
			.filter(w => w.cut !== null && !w.keep)
			.reduce((sum, w) => sum + (w.end - w.start), 0)
	);

	// ── Auto-scroll ───────────────────────────────────────────────────────────
	let container: HTMLDivElement | undefined;

	$effect(() => {
		const id = activeWordId;
		if (id === null) return;
		tick().then(() => {
			if (!container) return;
			// Plain word → direct data-word-id lookup
			let elem: Element | null = container.querySelector(`[data-word-id="${id}"]`);
			// Cut chip → scan data-chip-ids
			if (!elem) {
				for (const chip of Array.from(container.querySelectorAll('[data-chip-ids]'))) {
					const ids = (chip.getAttribute('data-chip-ids') ?? '').split(',').map(Number);
					if (ids.includes(id)) { elem = chip; break; }
				}
			}
			elem?.scrollIntoView({ behavior: isPlaying ? 'smooth' : 'auto', block: 'nearest' });
		});
	});

	// ── Chip helpers ──────────────────────────────────────────────────────────
	function chipIsActive(chip: ChipToken): boolean {
		return activeWordId !== null && chip.words.some(w => w.id === activeWordId);
	}

	function chipIsRestored(chip: ChipToken): boolean {
		return chip.words.every(w => w.keep);
	}

	function chipText(chip: ChipToken): string {
		if (chip.cutType === 'pause') {
			const dur = chip.words.reduce((s, w) => s + (w.end - w.start), 0).toFixed(1);
			return `[${dur}s pause]`;
		}
		return chip.words.map(w => w.text).join(' ');
	}

	function chipStyle(chip: ChipToken): string {
		const active   = chipIsActive(chip);
		const restored = chipIsRestored(chip);
		const isPause = chip.cutType === 'pause';

		if (restored && !active) {
			return `background:${isPause ? 'rgba(239,68,68,0.05)' : 'rgba(148,163,184,0.05)'};border:1px solid rgba(148,163,184,0.12);color:#65707c;`;
		}

		const rgb   = active ? '200,241,53' : CUT_RGB[chip.cutType];
		const color = active
			? '#c8f135'
			: isPause
				? '#f29a9a'
				: '#86919d';
		const bgAlpha = active ? 0.14 : restored ? 0.08 : isPause ? 0.12 : 0.1;

		const parts = [
			`background:rgba(${rgb},${bgAlpha})`,
			`border:1px solid rgba(${rgb},${active ? 0.34 : isPause ? 0.22 : 0.16})`,
			`color:${color}`,
		];

		if (!restored && !isPause) {
			parts.push(
				'text-decoration-line:line-through',
				`text-decoration-color:rgba(${rgb},0.55)`
			);
		}

		return parts.join(';') + ';';
	}

	function chipTooltip(chip: ChipToken): string {
		const verb = chipIsRestored(chip) ? 'remove' : 'restore';
		return `Click to ${verb} this ${CUT_LABEL[chip.cutType]}`;
	}

	function tokenKey(token: Token, index: number): string {
		if (token.type === 'plain') return `plain-${token.word.id}`;
		if (token.type === 'chip') return `chip-${token.words[0]?.id ?? index}`;
		return `marker-${token.wordId}`;
	}
</script>

<div class="flex flex-col h-full" style="background:#111111">

	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-center justify-between px-6 py-3 border-b border-[#1e1e1e] flex-shrink-0">
		<span
			class="text-[10px] uppercase font-mono tracking-[3px]"
			style="color:#444;font-family:'DM Mono',monospace;letter-spacing:3px;"
		>TRANSCRIPT</span>
		<span
			class="text-[11px] font-mono tabular-nums"
			style="color:#666;font-family:'DM Mono',monospace;"
		>−{totalCutSecs.toFixed(1)}s removed</span>
	</div>

	<!-- ── Prose ──────────────────────────────────────────────────────────── -->
	<div
		bind:this={container}
		class="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
		style="padding:20px 24px;line-height:2.2;font-size:15px;font-family:'DM Mono',monospace;color:#d4d4d4;scrollbar-width:none;"
	>
		{#each tokens as token, index (tokenKey(token, index))}
			{#if token.type === 'marker'}
				<span class="play-marker">
					<span class="play-marker__order">{token.playOrder}</span>
					<span class="play-marker__label">{token.slotLabel ?? 'Kept slot'}</span>
					{#if token.lineLabel}
						<span class="play-marker__meta">{token.lineLabel}</span>
					{/if}
				</span>{' '}
			{:else if token.type === 'plain'}
				<!-- Plain keep-word: click-to-seek, karaoke highlight when active -->
				<span
					data-word-id={token.word.id}
					role="button"
					tabindex="0"
					class="word-token"
					style={activeWordId === token.word.id
						? 'color:#f5ffd6;background:rgba(200,241,53,0.18);box-shadow:inset 0 0 0 1px rgba(200,241,53,0.22);border-radius:5px;'
						: ''}
					onclick={() => onSeek(token.word.start)}
					onkeydown={(e) => { if (e.key === 'Enter') onSeek(token.word.start); }}
				>{token.word.text}</span>{' '}
			{:else}
				<!-- Cut-run chip: single clickable affordance for the whole run -->
				<span
					data-chip-ids={token.words.map(w => w.id).join(',')}
					role="button"
					tabindex="0"
					class="chip-token"
					style={chipStyle(token)}
					title={chipTooltip(token)}
					onclick={() => onToggleGroup(token.words.map(w => w.id))}
					onkeydown={(e) => { if (e.key === 'Enter') onToggleGroup(token.words.map(w => w.id)); }}
				>{chipText(token)}<span class="chip-icon">{chipIsRestored(token) ? '✕' : '↩'}</span></span>{' '}
			{/if}
		{/each}
	</div>

	<!-- ── Footer ─────────────────────────────────────────────────────────── -->
	<div class="px-6 py-3 border-t border-[#1e1e1e] flex-shrink-0">
		<span
			class="text-[11px] font-mono"
			style="color:#333;font-family:'DM Mono',monospace;"
		>Click any highlighted phrase to toggle · Click any word to seek</span>
	</div>

</div>

<style>
	/* ── Plain word tokens ─────────────────────────────────────────────────── */
	.word-token {
		cursor: pointer;
		border-radius: 5px;
		padding: 1px 3px;
		background: rgba(148, 163, 184, 0.07);
		box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
		color: #d7dde5;
		transition: color 150ms, background-color 150ms, box-shadow 150ms;
	}

	.word-token:hover {
		background: rgba(148, 163, 184, 0.11);
		box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.14);
	}

	.play-marker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0 8px 0 2px;
		padding: 2px 8px 2px 3px;
		border-radius: 999px;
		background: rgba(91, 192, 190, 0.1);
		border: 1px solid rgba(91, 192, 190, 0.18);
		color: #9ad9d7;
		vertical-align: middle;
	}

	.play-marker__order {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 999px;
		background: rgba(91, 192, 190, 0.18);
		color: #dffaf8;
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
	}

	.play-marker__label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.play-marker__meta {
		font-size: 10px;
		color: rgba(154, 217, 215, 0.72);
	}

	/* ── Cut-run chips ─────────────────────────────────────────────────────── */
	.chip-token {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 7px;
		border-radius: 3px;
		margin: 0 2px;
		font-size: 13px;
		cursor: pointer;
		transition: transform 150ms, opacity 150ms;
		user-select: none;
		vertical-align: middle;
		line-height: 1.6;
		font-family: 'DM Mono', monospace;
	}

	.chip-token:hover {
		transform: translateY(-1px);
		opacity: 0.85;
	}

	.chip-icon {
		font-size: 9px;
		opacity: 0.7;
		flex-shrink: 0;
		line-height: 1;
	}
</style>
