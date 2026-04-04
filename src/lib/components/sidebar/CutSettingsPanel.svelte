<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';

	type CutToggles = {
		filler: boolean; pauses: boolean; restarts: boolean;
		mouthSounds: boolean; longPauses: boolean;
	};

	let {
		cutToggles   = $bindable<CutToggles>({ filler: true, pauses: true, restarts: true, mouthSounds: false, longPauses: false }),
		aggressiveness = $bindable(50),
		activeCuts   = 0,
		savingsStr   = '0m 00s',
		applying     = false,
		onApply      = () => {},
	}: {
		cutToggles?:     CutToggles;
		aggressiveness?: number;
		activeCuts?:     number;
		savingsStr?:     string;
		applying?:       boolean;
		onApply?:        () => void;
	} = $props();

	// Static row metadata — the enabled flag comes from cutToggles
	const rows = [
		{ key: 'filler'     as const, color: '#f97316', label: 'filler words',  desc: '"um", "uh", "you know", "like" — 147 detected' },
		{ key: 'pauses'     as const, color: '#3b82f6', label: 'dead pauses',   desc: 'Silences > 0.5s with no speech — 38 detected'  },
		{ key: 'restarts'   as const, color: '#22c55e', label: 'restarts',       desc: 'Repeated sentence starts — 22 detected'        },
		{ key: 'mouthSounds'as const, color: '#eab308', label: 'mouth sounds',  desc: 'Clicks, smacks, breath intakes — 14 detected'   },
		{ key: 'longPauses' as const, color: '#a855f7', label: 'long pauses',   desc: 'Silences > 2.0s treated as natural breaks — 8 detected' },
	];

	// Aggressiveness label driven by 0-100 value
	const aggrLabel = $derived(
		aggressiveness < 33 ? 'lite' : aggressiveness <= 66 ? 'balanced' : 'aggressive'
	);
	const aggrLevels = ['lite', 'balanced', 'aggressive'] as const;
</script>

<div class="flex flex-col gap-0 overflow-y-auto pb-[120px] [&::-webkit-scrollbar]:hidden" style="scrollbar-width:none">

	<div class="flex flex-col gap-3 px-4 pt-4 pb-3">
		<span class="text-[10px] font-semibold text-[#3f3f46] tracking-widest uppercase">Cut Settings</span>

		<div class="flex items-center gap-2">
			<span class="w-[7px] h-[7px] rounded-full bg-[#7c3aed] flex-shrink-0" style="box-shadow:0 0 5px #7c3aed80"></span>
			<span class="text-[13px] font-medium text-[#f5f5f5]">auto-cut settings</span>
		</div>

		<p class="text-[12px] text-[#6b7280]">
			{activeCuts} cuts ·
			<span class="text-[#7c3aed] font-medium">−{savingsStr}</span>
			will be removed
		</p>
	</div>

	<div class="border-t border-[#222222]"></div>

	<!-- ── Toggle rows ──────────────────────────────────────────────── -->
	<div class="flex flex-col">
		{#each rows as row, i}
			<div class="flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors">
				<span class="w-[6px] h-[6px] rounded-full flex-shrink-0 mt-[1px] self-start" style="background:{row.color}"></span>
				<div class="flex-1 min-w-0">
					<p class="text-[13px] font-medium text-[#f5f5f5] leading-[1.3]">{row.label}</p>
					<p class="text-[11px] text-[#6b7280] leading-[1.4] mt-[1px]">{row.desc}</p>
				</div>
				<Switch
					size="sm"
					class="flex-shrink-0"
					checked={cutToggles[row.key]}
					onCheckedChange={(v: boolean) => {
						cutToggles = { ...cutToggles, [row.key]: v };
					}}
				/>
			</div>
			{#if i < rows.length - 1}
				<div class="border-t border-[#1e1e1e] mx-4"></div>
			{/if}
		{/each}
	</div>

	<div class="border-t border-[#222222] mt-1"></div>

	<!-- ── Aggressiveness ───────────────────────────────────────────── -->
	<div class="px-4 py-4 flex flex-col gap-3">
		<div class="flex flex-col gap-0.5">
			<span class="text-[10px] font-semibold text-[#3f3f46] tracking-widest uppercase">Aggressiveness</span>
			<span class="text-[11px] text-[#3f3f46] leading-snug">How tightly cuts are trimmed around speech</span>
		</div>

		<div class="slider-aggr">
			<Slider type="single" bind:value={aggressiveness} min={0} max={100} step={1} />
		</div>

		<div class="flex justify-between px-[7px]">
			{#each aggrLevels as level}
				<span class="text-[11px] leading-none {aggrLabel === level ? 'text-[#f5f5f5] font-semibold' : 'text-[#3f3f46]'}">
					{level}
				</span>
			{/each}
		</div>
	</div>

	<div class="border-t border-[#222222]"></div>

	<!-- ── Apply button ─────────────────────────────────────────────── -->
	<div class="px-4 py-4">
		<button
			onclick={onApply}
			disabled={applying || activeCuts === 0}
			class="w-full h-11 bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] active:scale-95 text-white text-[13px] font-medium rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
		>
			{#if applying}
				<span class="apply-spinner w-[14px] h-[14px] rounded-full border-2 border-white/30 border-t-white flex-shrink-0"></span>
				applying…
			{:else}
				apply cuts &amp; preview
			{/if}
		</button>
	</div>

</div>

<style>
	.slider-aggr :global([data-slot="slider-track"])      { background-color:#222222; height:4px; }
	.slider-aggr :global([data-slot="slider-range"])      { background-color:#7c3aed; }
	.slider-aggr :global([data-slot="slider-thumb"])      { width:14px; height:14px; background-color:#7c3aed; border-color:#7c3aed; box-shadow:0 0 0 2px #111111; }
	.slider-aggr :global([data-slot="slider-thumb"]:hover),
	.slider-aggr :global([data-slot="slider-thumb"]:focus-visible) { box-shadow:0 0 0 2px #111111, 0 0 0 4px #7c3aed55; }

	.apply-spinner { animation: btn-spin 0.7s linear infinite; }
	@keyframes btn-spin { to { transform: rotate(360deg); } }
</style>
