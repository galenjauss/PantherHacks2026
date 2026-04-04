<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let fileInput = $state<HTMLInputElement>();
	let selectedFile = $state<File | null>(null);
	let uploading = $state(false);
	let response = $state("");
	let error = $state("");
	let jobId = $state("");
	let pollResult = $state("");

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
		</div>
	{/if}
</div>
