<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let fileInput: HTMLInputElement;
	let selectedFile: File | null = null;
	let uploading = false;
	let response: string = "";
	let error: string = "";
	let jobId: string = "";
	let pollResult: string = "";

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		selectedFile = input.files?.[0] ?? null;
		response = "";
		error = "";
		jobId = "";
		pollResult = "";
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

	<Button onclick={upload} disabled={!selectedFile || uploading}>
		{uploading ? "Uploading..." : "Upload & Create Job"}
	</Button>

	{#if error}
		<div class="mt-4 rounded bg-red-900/50 p-4 text-sm text-red-300">
			{error}
		</div>
	{/if}

	{#if response}
		<div class="mt-6">
			<h2 class="mb-2 text-lg font-semibold">Response</h2>
			<pre class="overflow-auto rounded bg-neutral-900 p-4 text-xs">{response}</pre>
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
			<pre class="overflow-auto rounded bg-neutral-900 p-4 text-xs">{pollResult}</pre>
		</div>
	{/if}
</div>
