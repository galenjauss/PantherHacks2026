import type {
	AutocutTranscriptWord,
	DebugLineSummary,
	DebugProblem,
	DebugSlotSummary,
	DebugVariantSummary,
	LineSlot,
	SlotVariantLockGroup,
	SlotVariantSpan,
	SpeechChunk,
	WordSemanticLabel
} from "$lib/types/autocut";
import { buildChunkIndexByWord } from "$lib/video/word-chunks";

export interface AnalysisSegmentRef<TSegment = { start: number; end: number }> {
	id: string;
	index: number;
	segment: TSegment;
}

interface SemanticEntry {
	index: number;
	word: AutocutTranscriptWord;
	label: WordSemanticLabel;
}

interface SlotAggregate {
	lineId: string;
	lineOrder: number;
	slotId: string;
	slotOrder: number;
	entries: SemanticEntry[];
	fillerEntries: SemanticEntry[];
	discardedEntries: SemanticEntry[];
	selectableEntries: SemanticEntry[];
}

interface VariantAggregate {
	lineId: string;
	lineOrder: number;
	slotId: string;
	slotOrder: number;
	variantId: string;
	entries: SemanticEntry[];
	rawStatuses: Set<"selected" | "alternate">;
}

export interface EditorSlotVariant extends SlotVariantSpan {
	id: string;
	label: string;
	start: number;
	end: number;
	durationMs: number;
	previewText: string;
	chunkCount: number;
	isStitched: boolean;
	internalPauseDurationMs: number;
	sourceChunks: SpeechChunk[];
	wordCount: number;
}

export interface EditorSlotGroup extends LineSlot {
	id: string;
	start: number;
	end: number;
	lineLabel: string;
	slotLabel: string;
	variants: EditorSlotVariant[];
}

export type EditorBeatVariant = EditorSlotVariant;
export type EditorBeatGroup = EditorSlotGroup;

export interface SemanticModel {
	slotGroups: EditorSlotGroup[];
	lineSummaries: DebugLineSummary[];
	slotSummaries: DebugSlotSummary[];
	variantSummaries: DebugVariantSummary[];
	problems: DebugProblem[];
}

function segmentId(index: number): string {
	return `segment:${index}`;
}

function joinTexts(values: string[]): string {
	return values
		.map((value) => value.trim())
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeToken(token: string): string {
	return token.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function toTokens(text: string): string[] {
	return text
		.split(/\s+/)
		.map(normalizeToken)
		.filter(Boolean);
}

function isWordPrefix(candidate: string, comparison: string): boolean {
	const left = toTokens(candidate);
	const right = toTokens(comparison);

	if (left.length === 0 || right.length === 0 || left.length >= right.length) {
		return false;
	}

	return left.every((token, index) => token === right[index]);
}

function collapseWordRanges(entries: SemanticEntry[]): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];

	for (const entry of entries) {
		const last = ranges[ranges.length - 1];
		if (!last || entry.index !== last[1] + 1) {
			ranges.push([entry.index, entry.index]);
			continue;
		}

		last[1] = entry.index;
	}

	return ranges;
}

function buildLockGroups(entries: SemanticEntry[]): SlotVariantLockGroup[] {
	const groups: SlotVariantLockGroup[] = [];

	for (const entry of entries) {
		const previous = groups[groups.length - 1];
		if (
			previous &&
			previous.lockId === (entry.label.lockId ?? null) &&
			entry.index === previous.wordEndIndex + 1
		) {
			previous.wordEndIndex = entry.index;
			previous.text = joinTexts([previous.text, entry.word.text]);
			continue;
		}

		groups.push({
			lockId: entry.label.lockId ?? null,
			wordStartIndex: entry.index,
			wordEndIndex: entry.index,
			text: entry.word.text
		});
	}

	return groups;
}

function uniqueChunksForRanges(
	wordRanges: Array<[number, number]>,
	chunkIndexByWord: Map<number, SpeechChunk>
): SpeechChunk[] {
	const chunks: SpeechChunk[] = [];
	const seenIds = new Set<string>();

	for (const [start, end] of wordRanges) {
		for (let wordIndex = start; wordIndex <= end; wordIndex += 1) {
			const chunk = chunkIndexByWord.get(wordIndex);
			if (!chunk || seenIds.has(chunk.chunkId)) continue;

			seenIds.add(chunk.chunkId);
			chunks.push(chunk);
		}
	}

	return chunks;
}

function sumInternalPauseDurationForRanges(
	wordRanges: Array<[number, number]>,
	chunks: SpeechChunk[]
): number {
	return chunks.reduce(
		(sum, chunk) =>
			sum +
			chunk.internalPauses.reduce((pauseTotal, pause) => {
				const belongsToVariant = wordRanges.some(
					([start, end]) => pause.afterWordIndex >= start && pause.afterWordIndex < end
				);
				return belongsToVariant ? pauseTotal + pause.durationMs : pauseTotal;
			}, 0),
		0
	);
}

function sumRangeDurations(
	wordRanges: Array<[number, number]>,
	words: AutocutTranscriptWord[]
): number {
	return wordRanges.reduce((sum, [start, end]) => {
		const startWord = words[start];
		const endWord = words[end];

		if (!startWord || !endWord) return sum;
		return sum + Math.max(endWord.end - startWord.start, 0);
	}, 0);
}

function compareVariantPreference(left: EditorSlotVariant, right: EditorSlotVariant): number {
	return (
		Number(right.status === "selected") - Number(left.status === "selected") ||
		right.wordCount - left.wordCount ||
		left.start - right.start ||
		left.variantId.localeCompare(right.variantId)
	);
}

function chooseSelectedVariant(
	slot: SlotAggregate,
	variants: EditorSlotVariant[],
	problems: DebugProblem[]
): string | null {
	if (variants.length === 0) {
		if (slot.discardedEntries.length > 0) {
			problems.push({
				type: "slot_has_only_discarded_words",
				lineId: slot.lineId,
				slotId: slot.slotId,
				message: `Slot ${slot.slotId} only contains discarded words.`
			});
		}

		return null;
	}

	const explicitlySelected = variants.filter((variant) => variant.status === "selected");

	if (explicitlySelected.length === 1) {
		return explicitlySelected[0].variantId;
	}

	if (explicitlySelected.length > 1) {
		const fallback = [...explicitlySelected].sort(compareVariantPreference)[0];
		problems.push({
			type: "slot_multiple_selected_variants",
			lineId: slot.lineId,
			slotId: slot.slotId,
			variantId: fallback.variantId,
			message: `Slot ${slot.slotId} has multiple selected variants; using ${fallback.variantId}.`
		});
		return fallback.variantId;
	}

	const fallback = [...variants].sort(compareVariantPreference)[0];
	problems.push({
		type: "slot_has_no_selected_variant",
		lineId: slot.lineId,
		slotId: slot.slotId,
		variantId: fallback.variantId,
		message: `Slot ${slot.slotId} has no selected variant; using ${fallback.variantId}.`
	});
	return fallback.variantId;
}

function humanizeOrdinal(prefix: string, value: number): string {
	return `${prefix} ${value}`;
}

function buildVariantLabel(
	variant: EditorSlotVariant,
	variantIndex: number,
	selectedVariantId: string | null
): string {
	if (variant.variantId === selectedVariantId) {
		return variant.status === "selected" ? "Selected" : "Selected alt";
	}

	return humanizeOrdinal("Variant", variantIndex + 1);
}

function buildSlotAggregates(
	words: AutocutTranscriptWord[],
	labels: WordSemanticLabel[]
): { slotMap: Map<string, SlotAggregate>; lineEntries: Map<string, SemanticEntry[]> } {
	const slotMap = new Map<string, SlotAggregate>();
	const lineEntries = new Map<string, SemanticEntry[]>();

	const sortedEntries = labels
		.map((label) => ({
			index: label.index,
			word: words[label.index],
			label
		}))
		.filter((entry): entry is SemanticEntry => Boolean(entry.word))
		.sort((left, right) => left.index - right.index);

	for (const entry of sortedEntries) {
		if (entry.label.lineId) {
			const existing = lineEntries.get(entry.label.lineId) ?? [];
			existing.push(entry);
			lineEntries.set(entry.label.lineId, existing);
		}

		if (
			!entry.label.slotId ||
			entry.label.lineId === null ||
			entry.label.lineOrder === null ||
			entry.label.slotOrder === null
		) {
			continue;
		}

		const aggregate =
			slotMap.get(entry.label.slotId) ??
			({
				lineId: entry.label.lineId,
				lineOrder: entry.label.lineOrder,
				slotId: entry.label.slotId,
				slotOrder: entry.label.slotOrder,
				entries: [],
				fillerEntries: [],
				discardedEntries: [],
				selectableEntries: []
			} satisfies SlotAggregate);

		aggregate.entries.push(entry);

		if (entry.label.status === "filler") {
			aggregate.fillerEntries.push(entry);
		} else if (entry.label.status === "discarded") {
			aggregate.discardedEntries.push(entry);
		} else if (entry.label.variantId) {
			aggregate.selectableEntries.push(entry);
		}

		slotMap.set(entry.label.slotId, aggregate);
	}

	return { slotMap, lineEntries };
}

function buildVariantAggregates(slot: SlotAggregate): VariantAggregate[] {
	const variants = new Map<string, VariantAggregate>();

	for (const entry of slot.selectableEntries) {
		const variantId = entry.label.variantId;
		if (!variantId) continue;

		const variant =
			variants.get(variantId) ??
			({
				lineId: slot.lineId,
				lineOrder: slot.lineOrder,
				slotId: slot.slotId,
				slotOrder: slot.slotOrder,
				variantId,
				entries: [],
				rawStatuses: new Set<"selected" | "alternate">()
			} satisfies VariantAggregate);

		variant.entries.push(entry);
		if (entry.label.status === "selected" || entry.label.status === "alternate") {
			variant.rawStatuses.add(entry.label.status);
		}

		variants.set(variantId, variant);
	}

	return [...variants.values()].sort(
		(left, right) => left.entries[0].index - right.entries[0].index
	);
}

export function buildAnalysisSegmentRefs<TSegment extends { start: number; end: number }>(
	segments: TSegment[]
): AnalysisSegmentRef<TSegment>[] {
	return segments.map((segment, index) => ({
		id: segmentId(index),
		index,
		segment
	}));
}

export function buildSemanticModel(
	words: AutocutTranscriptWord[],
	labels: WordSemanticLabel[],
	sourceChunks: SpeechChunk[]
): SemanticModel {
	const { slotMap, lineEntries } = buildSlotAggregates(words, labels);
	const chunkIndexByWord = buildChunkIndexByWord(sourceChunks);
	const problems: DebugProblem[] = [];
	const slotGroups = [...slotMap.values()]
		.sort(
			(left, right) =>
				left.lineOrder - right.lineOrder ||
				left.slotOrder - right.slotOrder ||
				left.entries[0].index - right.entries[0].index
		)
		.map((slot, slotIndex) => {
			const variants = buildVariantAggregates(slot).map((variantAggregate) => {
				const wordRanges = collapseWordRanges(variantAggregate.entries);
				const sourceVariantChunks = uniqueChunksForRanges(wordRanges, chunkIndexByWord);
				const variant: EditorSlotVariant = {
					id: `${slot.slotId}::${variantAggregate.variantId}`,
					lineId: variantAggregate.lineId,
					lineOrder: variantAggregate.lineOrder,
					slotId: variantAggregate.slotId,
					slotOrder: variantAggregate.slotOrder,
					variantId: variantAggregate.variantId,
					lockGroups: buildLockGroups(variantAggregate.entries),
					wordRanges,
					text: joinTexts(variantAggregate.entries.map((entry) => entry.word.text)),
					status: variantAggregate.rawStatuses.has("selected") ? "selected" : "alternate",
					label: "",
					start: words[wordRanges[0]?.[0]]?.start ?? 0,
					end: words[wordRanges[wordRanges.length - 1]?.[1]]?.end ?? 0,
					durationMs: sumRangeDurations(wordRanges, words),
					previewText: joinTexts(variantAggregate.entries.map((entry) => entry.word.text)),
					chunkCount: sourceVariantChunks.length,
					isStitched: sourceVariantChunks.length > 1,
					internalPauseDurationMs: sumInternalPauseDurationForRanges(
						wordRanges,
						sourceVariantChunks
					),
					sourceChunks: sourceVariantChunks,
					wordCount: variantAggregate.entries.length
				};

				if (variantAggregate.rawStatuses.size > 1) {
					problems.push({
						type: "selected_variant_conflicts_with_alternate",
						lineId: slot.lineId,
						slotId: slot.slotId,
						variantId: variant.variantId,
						message: `Variant ${variant.variantId} mixes selected and alternate labels.`
					});
				}

				if (variant.chunkCount > 1) {
					problems.push({
						type: "variant_spans_multiple_chunks",
						lineId: slot.lineId,
						slotId: slot.slotId,
						variantId: variant.variantId,
						message: `Variant ${variant.variantId} spans ${variant.chunkCount} pause-derived chunks.`
					});
				}

				return variant;
			});

			const selectedVariantId = chooseSelectedVariant(slot, variants, problems);
			const sortedVariants = [...variants].sort(compareVariantPreference);
			const labeledVariants = sortedVariants.map((variant, variantIndex) => ({
				...variant,
				label: buildVariantLabel(variant, variantIndex, selectedVariantId)
			}));
			const selectedVariant =
				labeledVariants.find((variant) => variant.variantId === selectedVariantId) ?? null;
			const longestVariant = [...labeledVariants].sort(
				(left, right) => right.wordCount - left.wordCount || left.start - right.start
			)[0];

			if (
				selectedVariant &&
				longestVariant &&
				selectedVariant.variantId !== longestVariant.variantId &&
				isWordPrefix(selectedVariant.text, longestVariant.text)
			) {
				problems.push({
					type: "slot_selected_variant_missing_words",
					lineId: slot.lineId,
					slotId: slot.slotId,
					variantId: selectedVariant.variantId,
					message: `Selected variant ${selectedVariant.variantId} looks truncated relative to ${longestVariant.variantId}.`
				});
			}

			if (selectedVariant) {
				const selectedLockIds = new Set(
					selectedVariant.lockGroups
						.map((group) => group.lockId)
						.filter((lockId): lockId is string => Boolean(lockId))
				);
				const fillerConflict = slot.fillerEntries.find((entry) =>
					entry.label.lockId ? selectedLockIds.has(entry.label.lockId) : false
				);

				if (fillerConflict) {
					problems.push({
						type: "filler_inside_selected_lock",
						lineId: slot.lineId,
						slotId: slot.slotId,
						variantId: selectedVariant.variantId,
						message: `Selected variant ${selectedVariant.variantId} contains filler inside lock ${fillerConflict.label.lockId}.`
					});
				}
			}

			return {
				id: slot.slotId,
				lineId: slot.lineId,
				lineOrder: slot.lineOrder,
				slotId: slot.slotId,
				slotOrder: slot.slotOrder,
				selectedVariantId,
				variants: labeledVariants,
				start: labeledVariants[0]?.start ?? words[slot.entries[0]?.index]?.start ?? 0,
				end:
					labeledVariants[labeledVariants.length - 1]?.end ??
					words[slot.entries[slot.entries.length - 1]?.index]?.end ??
					0,
				lineLabel: humanizeOrdinal("Line", slot.lineOrder),
				slotLabel: humanizeOrdinal("Slot", slotIndex + 1)
			} satisfies EditorSlotGroup;
		});

	const lineSummaries = [...lineEntries.entries()]
		.map(([lineId, entries]) => {
			const lineOrder =
				entries.find((entry) => entry.label.lineOrder !== null)?.label.lineOrder ?? 0;
			const slots = slotGroups
				.filter((slot) => slot.lineId === lineId)
				.sort((left, right) => left.slotOrder - right.slotOrder);
			const selectedVariants = slots
				.map((slot) =>
					slot.variants.find((variant) => variant.variantId === slot.selectedVariantId)
				)
				.filter((variant): variant is EditorSlotVariant => Boolean(variant));

			if (slots.some((slot) => !slot.selectedVariantId)) {
				problems.push({
					type: "line_has_gap_in_selected_slots",
					lineId,
					message: `Line ${lineId} is missing a selected variant for at least one slot.`
				});
			}

			return {
				lineId,
				lineOrder,
				slotIds: slots.map((slot) => slot.slotId),
				selectedVariantIds: selectedVariants.map((variant) => variant.variantId),
				text: joinTexts(entries.map((entry) => entry.word.text)),
				selectedText: joinTexts(selectedVariants.map((variant) => variant.text)),
				wordRange: {
					start: entries[0]?.index ?? null,
					end: entries[entries.length - 1]?.index ?? null
				}
			} satisfies DebugLineSummary;
		})
		.sort((left, right) => left.lineOrder - right.lineOrder);

	const slotSummaries = slotGroups.map((slot) => {
		const selectedVariant =
			slot.variants.find((variant) => variant.variantId === slot.selectedVariantId) ?? null;
		const slotEntries = slotMap.get(slot.slotId)?.entries ?? [];

		return {
			lineId: slot.lineId,
			lineOrder: slot.lineOrder,
			slotId: slot.slotId,
			slotOrder: slot.slotOrder,
			selectedVariantId: slot.selectedVariantId,
			text: joinTexts(slotEntries.map((entry) => entry.word.text)),
			selectedText: selectedVariant?.text ?? "",
			variantIds: slot.variants.map((variant) => variant.variantId),
			wordRange: {
				start: slotEntries[0]?.index ?? null,
				end: slotEntries[slotEntries.length - 1]?.index ?? null
			}
		} satisfies DebugSlotSummary;
	});

	const variantSummaries = slotGroups.flatMap((slot) =>
		slot.variants.map((variant) => ({
			lineId: variant.lineId,
			lineOrder: variant.lineOrder,
			slotId: variant.slotId,
			slotOrder: variant.slotOrder,
			variantId: variant.variantId,
			status: variant.status,
			text: variant.text,
			wordRanges: variant.wordRanges,
			lockGroups: variant.lockGroups,
			chunkIds: variant.sourceChunks.map((chunk) => chunk.chunkId),
			chunkCount: variant.chunkCount
		}))
	);

	return {
		slotGroups,
		lineSummaries,
		slotSummaries,
		variantSummaries,
		problems
	};
}
