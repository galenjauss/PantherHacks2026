<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let fileInput = $state<HTMLInputElement>();
	let selectedFile = $state<File | null>(null);
	let videoUrl = $state<string | null>(null);
	let videoEl = $state<HTMLVideoElement>();
	let uploading = $state(false);
	let response = $state("");
	let error = $state("");
	let jobId = $state("");
	let pollResult = $state("");
	let isPreviewPlaying = $state(false);
	let currentSegmentIndex = $state(0);

	// Transcription state
	interface TranscriptWord {
		text: string;
		start: number;
		end: number;
		confidence: number;
	}

	interface Segment {
		start: number;
		end: number;
		category: "good" | "filler_words" | "retake" | "dead_space";
		text: string;
	}

	let transcribing = $state(false);
	let transcriptId = $state("");
	let transcriptStatus = $state("");
	let transcriptText = $state("");
	let transcriptWords = $state<TranscriptWord[]>([]);
	let transcriptError = $state("");
	let pollingTranscript = $state(false);

	// Analysis state
	let analyzing = $state(false);
	let segments = $state<Segment[]>([]);
	let analysisError = $state("");

	// Filter state
	let showGood = $state(true);
	let showFiller = $state(true);
	let showRetake = $state(true);
	let showDeadSpace = $state(true);

	const categoryColors: Record<string, string> = {
		good: "bg-green-900/40 text-green-300",
		filler_words: "bg-yellow-900/40 text-yellow-300",
		retake: "bg-red-900/40 text-red-300",
		dead_space: "bg-neutral-700/40 text-neutral-400"
	};

	const categoryLabels: Record<string, string> = {
		good: "Good",
		filler_words: "Filler Words",
		retake: "Retake",
		dead_space: "Dead Space"
	};

	function filteredSegments(): Segment[] {
		return segments.filter((s) => {
			if (s.category === "good") return showGood;
			if (s.category === "filler_words") return showFiller;
			if (s.category === "retake") return showRetake;
			if (s.category === "dead_space") return showDeadSpace;
			return true;
		});
	}

	function formatMs(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const millis = ms % 1000;
		return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		selectedFile = input.files?.[0] ?? null;
		// Create object URL for video preview
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		videoUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;
		response = "";
		error = "";
		jobId = "";
		pollResult = "";
		transcriptId = "";
		transcriptStatus = "";
		transcriptText = "";
		transcriptWords = [];
		transcriptError = "";
		segments = [];
		analysisError = "";
		isPreviewPlaying = false;
		currentSegmentIndex = 0;
	}

	function getGoodSegments(): Segment[] {
		return segments.filter((s) => s.category === "good");
	}

	function playPreview() {
		const good = getGoodSegments();
		if (!videoEl || good.length === 0) return;

		isPreviewPlaying = true;
		currentSegmentIndex = 0;
		playSegment(0, good);
	}

	function playSegment(index: number, good: Segment[]) {
		if (!videoEl || index >= good.length) {
			isPreviewPlaying = false;
			currentSegmentIndex = 0;
			return;
		}

		currentSegmentIndex = index;
		const seg = good[index];
		videoEl.currentTime = seg.start / 1000;
		videoEl.play();

		const onTimeUpdate = () => {
			if (!videoEl) return;
			if (videoEl.currentTime >= seg.end / 1000) {
				videoEl.removeEventListener("timeupdate", onTimeUpdate);
				videoEl.pause();
				// Move to the next good segment
				playSegment(index + 1, good);
			}
		};

		videoEl.addEventListener("timeupdate", onTimeUpdate);
	}

	function stopPreview() {
		if (!videoEl) return;
		videoEl.pause();
		isPreviewPlaying = false;
		currentSegmentIndex = 0;
	}

	async function upload() {
		if (!selectedFile) return;

		uploading = true;
		error = "";
		response = "";
		jobId = "";
		pollResult = "";

		try {
			const formData = new FormData();
			formData.append("file", selectedFile);

			const res = await fetch("/api/video/autocut", {
				method: "POST",
				body: formData
			});

			const data = await res.json();
			response = JSON.stringify(data, null, 2);

			if (res.ok && data.job?.id) {
				jobId = data.job.id;
			} else if (!res.ok) {
				error = `HTTP ${res.status}: ${data.error ?? "Unknown error"}`;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : "Request failed";
		} finally {
			uploading = false;
		}
	}

	async function pollJob() {
		if (!jobId) return;

		try {
			const res = await fetch(`/api/video/autocut/${jobId}`);
			const data = await res.json();
			pollResult = JSON.stringify(data, null, 2);
		} catch (err) {
			pollResult = err instanceof Error ? err.message : "Poll failed";
		}
	}

	async function transcribe() {
		if (!selectedFile) return;

		transcribing = true;
		transcriptError = "";
		transcriptId = "";
		transcriptStatus = "";
		transcriptText = "";
		transcriptWords = [];

		try {
			const formData = new FormData();
			formData.append("file", selectedFile);

			const res = await fetch("/api/video/transcribe", {
				method: "POST",
				body: formData
			});

			const data = await res.json();

			if (res.ok && data.transcript_id) {
				transcriptId = data.transcript_id;
				transcriptStatus = data.status;
				// Auto-poll until complete
				pollTranscript();
			} else {
				transcriptError = data.error ?? "Failed to start transcription";
			}
		} catch (err) {
			transcriptError = err instanceof Error ? err.message : "Request failed";
		} finally {
			transcribing = false;
		}
	}

	async function analyzeTranscript() {
		analyzing = true;
		analysisError = "";
		segments = [];

		try {
			const res = await fetch("/api/video/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ words: transcriptWords })
			});

			const data = await res.json();

			if (res.ok && data.segments) {
				segments = data.segments;
			} else {
				analysisError = data.error ?? "Analysis failed";
			}
		} catch (err) {
			analysisError = err instanceof Error ? err.message : "Analysis request failed";
		} finally {
			analyzing = false;
		}
	}

	async function pollTranscript() {
		if (!transcriptId) return;

		pollingTranscript = true;

		try {
			const res = await fetch(`/api/video/transcribe/${transcriptId}`);
			const data = await res.json();

			transcriptStatus = data.status;

			if (data.status === "completed") {
				transcriptText = data.text ?? "";
				transcriptWords = data.words ?? [];
				pollingTranscript = false;
				// Auto-trigger LLM analysis
				if (transcriptWords.length > 0) {
					analyzeTranscript();
				}
			} else if (data.status === "error") {
				transcriptError = data.error ?? "Transcription failed";
				pollingTranscript = false;
			} else {
				// Still processing, poll again in 3 seconds
				setTimeout(pollTranscript, 3000);
			}
		} catch (err) {
			transcriptError = err instanceof Error ? err.message : "Poll failed";
			pollingTranscript = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl p-8">
	<h1 class="mb-6 text-2xl font-bold">Video Upload Test</h1>

	<div class="mb-4">
		<label class="mb-2 block text-sm font-medium" for="video-file">Select a video file</label>
		<input
			id="video-file"
			type="file"
			accept="video/*"
			bind:this={fileInput}
			onchange={handleFileChange}
			class="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-sm file:text-white hover:file:bg-neutral-700"
		/>
	</div>

	{#if selectedFile}
		<p class="mb-4 text-sm text-neutral-400">
			{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
		</p>
	{/if}

	{#if videoUrl}
		<div class="mb-6">
			<video
				bind:this={videoEl}
				src={videoUrl}
				class="w-full rounded"
				preload="auto"
			>
				<track kind="captions" />
			</video>

			{#if segments.length > 0}
				<div class="mt-3 flex items-center gap-3">
					{#if isPreviewPlaying}
						<Button onclick={stopPreview} variant="destructive" size="sm">
							Stop Preview
						</Button>
						<span class="text-sm text-neutral-400">
							Playing segment {currentSegmentIndex + 1} / {getGoodSegments().length}
						</span>
					{:else}
						<Button onclick={playPreview} size="sm" disabled={getGoodSegments().length === 0}>
							Play "Good" Segments ({getGoodSegments().length})
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<div class="flex gap-3">
		<Button onclick={upload} disabled={!selectedFile || uploading}>
			{uploading ? "Uploading..." : "Upload & Create Job"}
		</Button>

		<Button onclick={transcribe} disabled={!selectedFile || transcribing} variant="secondary">
			{transcribing ? "Submitting..." : "Transcribe"}
		</Button>
	</div>

	{#if error}
		<div class="mt-4 rounded bg-red-900/50 p-4 text-sm text-red-300">
			{error}
		</div>
	{/if}

	{#if response}
		<div class="mt-6">
			<h2 class="mb-2 text-lg font-semibold">Response</h2>
			<pre class="overflow-auto rounded bg-neutral-900 p-4 text-xs text-neutral-100">{response}</pre>
		</div>
	{/if}

	{#if jobId}
		<div class="mt-4">
			<Button onclick={pollJob} variant="outline">Poll Job Status</Button>
		</div>
	{/if}

	{#if pollResult}
		<div class="mt-4">
			<h2 class="mb-2 text-lg font-semibold">Job Status</h2>
			<pre class="overflow-auto rounded bg-neutral-900 p-4 text-xs text-neutral-100">{pollResult}</pre>
		</div>
	{/if}

	<!-- Transcription Section -->
	{#if transcriptError}
		<div class="mt-4 rounded bg-red-900/50 p-4 text-sm text-red-300">
			{transcriptError}
		</div>
	{/if}

	{#if transcriptId}
		<div class="mt-6">
			<h2 class="mb-2 text-lg font-semibold">Transcription</h2>
			<p class="mb-2 text-sm text-neutral-400">
				ID: {transcriptId} &middot; Status: <span class="font-medium text-neutral-200">{transcriptStatus}</span>
				{#if pollingTranscript}
					<span class="ml-2 animate-pulse text-yellow-400">polling...</span>
				{/if}
			</p>

			{#if transcriptText}
				<div class="rounded bg-neutral-900 p-4 text-sm leading-relaxed text-neutral-100">
					{transcriptText}
				</div>
			{/if}

			{#if transcriptWords.length > 0}
				<h3 class="mb-2 mt-4 text-sm font-semibold">Timestamped Words</h3>
				<div class="max-h-96 overflow-auto rounded bg-neutral-900 p-4">
					<table class="w-full text-left text-xs">
						<thead class="sticky top-0 bg-neutral-900 text-neutral-400">
							<tr>
								<th class="pb-2 pr-4">Start</th>
								<th class="pb-2 pr-4">End</th>
								<th class="pb-2 pr-4">Word</th>
								<th class="pb-2">Confidence</th>
							</tr>
						</thead>
						<tbody class="text-neutral-100">
							{#each transcriptWords as word}
								<tr class="border-t border-neutral-800">
									<td class="py-1 pr-4 font-mono text-neutral-400">{formatMs(word.start)}</td>
									<td class="py-1 pr-4 font-mono text-neutral-400">{formatMs(word.end)}</td>
									<td class="py-1 pr-4">{word.text}</td>
									<td class="py-1 font-mono">{(word.confidence * 100).toFixed(0)}%</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if transcriptWords.length > 0}
				<details class="mt-4">
					<summary class="cursor-pointer text-sm font-semibold text-neutral-400 hover:text-neutral-200">
						Raw Transcript JSON (sent to LLM)
					</summary>
					<pre class="mt-2 max-h-96 overflow-auto rounded bg-neutral-900 p-4 text-xs text-neutral-100">{JSON.stringify(transcriptWords, null, 2)}</pre>
				</details>
			{/if}
		</div>
	{/if}

	<!-- Analysis Section -->
	{#if analyzing}
		<div class="mt-6">
			<h2 class="mb-2 text-lg font-semibold">Analysis</h2>
			<p class="animate-pulse text-sm text-yellow-400">Analyzing transcript with LLM...</p>
		</div>
	{/if}

	{#if analysisError}
		<div class="mt-4 rounded bg-red-900/50 p-4 text-sm text-red-300">
			{analysisError}
		</div>
	{/if}

	{#if segments.length > 0}
		<div class="mt-6">
			<h2 class="mb-2 text-lg font-semibold">Analysis — Table</h2>

			<!-- Filter checkboxes -->
			<div class="mb-3 flex flex-wrap gap-4 text-sm">
				<label class="flex items-center gap-2 rounded px-2 py-1 bg-green-900/40 text-green-300">
					<input type="checkbox" bind:checked={showGood} /> Good
				</label>
				<label class="flex items-center gap-2 rounded px-2 py-1 bg-yellow-900/40 text-yellow-300">
					<input type="checkbox" bind:checked={showFiller} /> Filler Words
				</label>
				<label class="flex items-center gap-2 rounded px-2 py-1 bg-red-900/40 text-red-300">
					<input type="checkbox" bind:checked={showRetake} /> Retake
				</label>
				<label class="flex items-center gap-2 rounded px-2 py-1 bg-neutral-700/40 text-neutral-400">
					<input type="checkbox" bind:checked={showDeadSpace} /> Dead Space
				</label>
			</div>

			<div class="max-h-96 overflow-auto rounded bg-neutral-900 p-4">
				<table class="w-full text-left text-xs">
					<thead class="sticky top-0 bg-neutral-900 text-neutral-400">
						<tr>
							<th class="pb-2 pr-4">Start</th>
							<th class="pb-2 pr-4">End</th>
							<th class="pb-2 pr-4">Category</th>
							<th class="pb-2">Text</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredSegments() as segment}
							<tr class="border-t border-neutral-800 {categoryColors[segment.category]}">
								<td class="py-1 pr-4 font-mono">{formatMs(segment.start)}</td>
								<td class="py-1 pr-4 font-mono">{formatMs(segment.end)}</td>
								<td class="py-1 pr-4 font-medium">{categoryLabels[segment.category]}</td>
								<td class="py-1">{segment.text}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<h2 class="mb-2 mt-6 text-lg font-semibold">Analysis — JSON</h2>
			<pre class="max-h-96 overflow-auto rounded bg-neutral-900 p-4 text-xs text-neutral-100">{JSON.stringify(segments, null, 2)}</pre>
		</div>
	{/if}
</div>
