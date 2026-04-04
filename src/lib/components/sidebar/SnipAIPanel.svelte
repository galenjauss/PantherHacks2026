<script lang="ts">
	// step: 1-indexed active step (3–5 while processing, 6 = all done)
	let { step = 3 }: { step: number } = $props();

	const stepDefs = [
		'uploaded & validated format',
		'transcribing audio via assemblyai',
		'detecting filler words & dead air…',
		'classifying cut types',
		'rendering clean preview',
	];

	const total = stepDefs.length;

	const steps = $derived(
		stepDefs.map((label, i) => {
			const n = i + 1;
			const state = step > total || n < step ? 'done'
			            : n === step             ? 'active'
			            :                          'pending';
			return {
				label,
				state,
				glyph: state === 'done' ? '✓' : state === 'active' ? '•' : '—',
			} as { label: string; state: 'done' | 'active' | 'pending'; glyph: string };
		})
	);

	// Fill width: proportion of fully-completed steps
	const fillPct = $derived(Math.min(Math.max(step - 1, 0), total) / total * 100);

	const glyphColor = { done: '#22c55e', active: '#7c3aed', pending: '#3f3f46' };
	const labelColor = { done: '#6b7280', active: '#f5f5f5', pending: '#3f3f46' };
</script>

<div class="mx-4 my-3 bg-[#1a1a1a] border border-[#222222] rounded-lg p-4 flex flex-col gap-3">

	<span class="text-[10px] font-semibold text-[#3f3f46] tracking-widest uppercase">Snip AI</span>

	<!-- Header row -->
	<div class="flex items-center gap-2">
		<span class="pulse-dot w-[7px] h-[7px] rounded-full bg-[#7c3aed] flex-shrink-0"></span>
		<span class="text-[13px] font-medium text-[#f5f5f5] flex-1 leading-none">
			{step > total ? 'analysis complete' : 'analysing…'}
		</span>
		<span class="text-[12px] text-[#6b7280] font-mono tabular-nums flex-shrink-0">
			{Math.min(step, total)}&thinsp;/&thinsp;{total}
		</span>
	</div>

	<!-- Progress bar -->
	<div class="w-full h-[2px] rounded-full bg-[#1f1f1f] overflow-hidden relative">
		<div class="absolute inset-y-0 left-0 rounded-full bg-[#7c3aed] transition-all duration-500"
			 style="width:{fillPct}%"></div>
		<div class="absolute inset-y-0 left-0 rounded-full overflow-hidden transition-all duration-500"
			 style="width:{fillPct}%">
			<div class="shimmer-track absolute inset-0"></div>
		</div>
	</div>

	<!-- Step checklist -->
	<ol class="flex flex-col gap-0">
		{#each steps as s}
			<li class="flex items-center gap-2.5 h-7">
				<span
					class="w-3 text-center text-[12px] font-bold leading-none flex-shrink-0
						{s.state === 'active' ? 'active-glyph' : ''}"
					style="color:{glyphColor[s.state]}"
				>{s.glyph}</span>
				<span class="text-[12px] leading-none truncate" style="color:{labelColor[s.state]}">
					{s.label}
				</span>
			</li>
		{/each}
	</ol>

</div>

<style>
	.pulse-dot   { animation: dot-pulse   1.5s ease-in-out infinite; }
	.active-glyph{ animation: glyph-pulse 1.5s ease-in-out infinite; }

	@keyframes dot-pulse   { 0%,100%{opacity:.35;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
	@keyframes glyph-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }

	.shimmer-track {
		background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.25) 50%, transparent 100%);
		animation: shimmer-slide 1.8s ease-in-out infinite;
		transform: translateX(-100%);
	}
	@keyframes shimmer-slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
</style>
