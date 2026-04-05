import type {
	AutocutTranscriptWord,
	SpeechChunk,
	SpeechChunkPause,
	WordSemanticLabel,
	WordStatus
} from "$lib/types/autocut";

type ChunkLabelInput = Pick<
	WordSemanticLabel,
	"index" | "lineId" | "slotId" | "variantId" | "status"
>;

export const DEFAULT_INTERNAL_PAUSE_FLOOR_MS = 300;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
	const seen = new Set<string>();
	const ordered: string[] = [];

	for (const value of values) {
		if (!value || seen.has(value)) continue;

		seen.add(value);
		ordered.push(value);
	}

	return ordered;
}

function uniqueStatuses(values: Array<WordStatus | null | undefined>): WordStatus[] {
	const seen = new Set<WordStatus>();
	const ordered: WordStatus[] = [];

	for (const value of values) {
		if (!value || seen.has(value)) continue;

		seen.add(value);
		ordered.push(value);
	}

	return ordered;
}

function pushChunk(
	chunks: SpeechChunk[],
	words: AutocutTranscriptWord[],
	labelMap: Map<number, ChunkLabelInput>,
	wordStartIndex: number,
	wordEndIndex: number,
	internalPauses: SpeechChunkPause[]
) {
	const chunkWords = words.slice(wordStartIndex, wordEndIndex + 1);
	if (chunkWords.length === 0) return;

	const chunkId = `chunk_${chunks.length + 1}`;

	chunks.push({
		chunkId,
		wordStartIndex,
		wordEndIndex,
		start: chunkWords[0].start,
		end: chunkWords[chunkWords.length - 1].end,
		text: chunkWords.map((word) => word.text).join(" ").trim(),
		internalPauses: [...internalPauses],
		durationMs: Math.max(chunkWords[chunkWords.length - 1].end - chunkWords[0].start, 0),
		lineIds: uniqueStrings(
			chunkWords.map((_, offset) => labelMap.get(wordStartIndex + offset)?.lineId ?? null)
		),
		slotIds: uniqueStrings(
			chunkWords.map((_, offset) => labelMap.get(wordStartIndex + offset)?.slotId ?? null)
		),
		variantIds: uniqueStrings(
			chunkWords.map((_, offset) => labelMap.get(wordStartIndex + offset)?.variantId ?? null)
		),
		statuses: uniqueStatuses(
			chunkWords.map((_, offset) => labelMap.get(wordStartIndex + offset)?.status ?? null)
		)
	});
}

export function buildSpeechChunks(
	words: AutocutTranscriptWord[],
	labels: ChunkLabelInput[],
	minimumPauseLengthMs: number,
	notablePauseFloorMs = DEFAULT_INTERNAL_PAUSE_FLOOR_MS
): SpeechChunk[] {
	if (words.length === 0) {
		return [];
	}

	const labelMap = new Map(labels.map((label) => [label.index, label]));
	const chunks: SpeechChunk[] = [];
	let chunkStartIndex = 0;
	let internalPauses: SpeechChunkPause[] = [];

	for (let index = 0; index < words.length - 1; index += 1) {
		const currentWord = words[index];
		const nextWord = words[index + 1];
		const gapMs = Math.max(0, nextWord.start - currentWord.end);

		if (gapMs > minimumPauseLengthMs) {
			pushChunk(chunks, words, labelMap, chunkStartIndex, index, internalPauses);
			chunkStartIndex = index + 1;
			internalPauses = [];
			continue;
		}

		if (gapMs >= notablePauseFloorMs && gapMs <= minimumPauseLengthMs) {
			internalPauses.push({
				afterWordIndex: index,
				durationMs: gapMs
			});
		}
	}

	pushChunk(chunks, words, labelMap, chunkStartIndex, words.length - 1, internalPauses);
	return chunks;
}

export function buildChunkIndexByWord(chunks: SpeechChunk[]): Map<number, SpeechChunk> {
	const index = new Map<number, SpeechChunk>();

	for (const chunk of chunks) {
		for (let wordIndex = chunk.wordStartIndex; wordIndex <= chunk.wordEndIndex; wordIndex += 1) {
			index.set(wordIndex, chunk);
		}
	}

	return index;
}
