<script lang="ts">
	const stats = [
		{ color: '#f97316', label: 'filler words', fill: 55, count: '147' },
		{ color: '#3b82f6', label: 'dead pauses',  fill: 35, count: '38'  },
		{ color: '#22c55e', label: 'restarts',     fill: 20, count: '22'  },
	];
</script>

<div class="flex flex-col gap-2 px-4 py-3">

	<!-- ── Preliminary Analysis ───────────────────────────────────────── -->
	<span class="text-[10px] font-semibold text-[#3f3f46] tracking-widest uppercase">
		Preliminary Analysis
	</span>

	<div class="flex flex-col gap-2.5">
		{#each stats as s}
			<div class="flex items-center gap-2.5">
				<!-- Color dot -->
				<span
					class="w-[6px] h-[6px] rounded-full flex-shrink-0"
					style="background:{s.color}"
				></span>

				<!-- Label -->
				<span class="text-[12px] text-[#6b7280] w-[86px] flex-shrink-0 leading-none">
					{s.label}
				</span>

				<!-- Track + fill -->
				<div class="flex-1 h-1 rounded-full bg-[#222222] overflow-hidden">
					<div
						class="h-full rounded-full"
						style="width:{s.fill}%; background:{s.color};"
					></div>
				</div>

				<!-- Count -->
				<span class="text-[13px] font-medium text-[#f5f5f5] w-7 text-right flex-shrink-0 tabular-nums font-mono">
					{s.count}
				</span>
			</div>
		{/each}
	</div>

	<!-- ── Recommendation card ────────────────────────────────────────── -->
	<div class="mt-1 bg-[#1a1a1a] border border-[#222222] rounded-lg p-4 flex flex-col gap-2">
		<span class="text-[10px] font-bold text-[#7c3aed] tracking-widest uppercase leading-none">
			Recommendation
		</span>
		<p class="text-[12px] text-[#6b7280] leading-[1.6]">
			High filler density (3.5/min), <span class="text-[#a1a1aa] font-medium">"um"</span>
			(89×) and <span class="text-[#a1a1aa] font-medium">"you know"</span> (34×) most
			common. Estimated
			<span class="text-[#f5f5f5] font-medium">4m 12s</span> removed at balanced
			aggressiveness.
		</p>
	</div>

</div>
