<script lang="ts">
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from "$lib/components/ui/table";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "$lib/components/ui/collapsible";
	import { Separator } from "$lib/components/ui/separator";
	import { Badge } from "$lib/components/ui/badge";
	import { Spinner } from "$lib/components/ui/spinner";
	import { cn } from "$lib/utils.js";
	import AlertCircleIcon from "@lucide/svelte/icons/circle-alert";
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

	const categoryRowClass: Record<string, string> = {
		good: "bg-emerald-500/5 hover:bg-emerald-500/10",
		filler_words: "bg-amber-500/5 hover:bg-amber-500/10",
		retake: "bg-destructive/5 hover:bg-destructive/10",
		dead_space: "bg-muted/40 hover:bg-muted/60"
	};

	const categoryBadgeClass: Record<string, string> = {
		good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
		filler_words: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
		retake: "",
		dead_space: "text-muted-foreground"
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

<div class="mx-auto max-w-7xl p-6">
	<h1 class="mb-6 text-3xl font-semibold tracking-tight">Video upload test</h1>

	<div class="grid gap-6 lg:grid-cols-2 lg:items-start">
		<!-- Video & controls (left) -->
		<div class="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
			<Card>
				<CardHeader>
					<CardTitle>Video</CardTitle>
					<CardDescription>Select a file, preview it, and run upload or transcription.</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="video-file">Video file</Label>
						<Input
							id="video-file"
							type="file"
							accept="video/*"
							onchange={handleFileChange}
						/>
					</div>

					{#if selectedFile}
						<p class="text-muted-foreground text-sm">
							{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
						</p>
					{/if}

					{#if videoUrl}
						<div class="overflow-hidden rounded-lg border bg-muted">
							<video
								bind:this={videoEl}
								src={videoUrl}
								class="aspect-video w-full object-contain"
								preload="auto"
								controls
							>
								<track kind="captions" />
							</video>
						</div>

						{#if segments.length > 0}
							<div class="flex flex-wrap items-center gap-3">
								{#if isPreviewPlaying}
									<Button onclick={stopPreview} variant="destructive" size="sm">
										Stop preview
									</Button>
									<span class="text-muted-foreground text-sm">
										Segment {currentSegmentIndex + 1} / {getGoodSegments().length}
									</span>
								{:else}
									<Button onclick={playPreview} size="sm" disabled={getGoodSegments().length === 0}>
										Play “good” segments ({getGoodSegments().length})
									</Button>
								{/if}
							</div>
						{/if}
					{/if}
				</CardContent>
				<CardFooter class="flex flex-wrap gap-2">
					<Button onclick={upload} disabled={!selectedFile || uploading}>
						{uploading ? "Uploading…" : "Upload & create job"}
					</Button>
					<Button onclick={transcribe} disabled={!selectedFile || transcribing} variant="secondary">
						{transcribing ? "Submitting…" : "Transcribe"}
					</Button>
					{#if jobId}
						<Button onclick={pollJob} variant="outline">Poll job status</Button>
					{/if}
				</CardFooter>
			</Card>
		</div>

		<!-- API output, tables, JSON (right) -->
		<div class="flex min-h-0 min-w-0 flex-col gap-6">
			{#if error}
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>Upload error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}

			{#if response}
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-base">Autocut response</CardTitle>
					</CardHeader>
					<CardContent>
						<ScrollArea class="h-56 rounded-md border">
							<pre class="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{response}</pre>
						</ScrollArea>
					</CardContent>
				</Card>
			{/if}

			{#if pollResult}
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-base">Job status</CardTitle>
					</CardHeader>
					<CardContent>
						<ScrollArea class="h-56 rounded-md border">
							<pre class="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{pollResult}</pre>
						</ScrollArea>
					</CardContent>
				</Card>
			{/if}

			{#if transcriptError}
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>Transcription error</AlertTitle>
					<AlertDescription>{transcriptError}</AlertDescription>
				</Alert>
			{/if}

			{#if transcriptId}
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-base">Transcription</CardTitle>
						<CardDescription class="flex flex-wrap items-center gap-2">
							<span class="font-mono text-xs">{transcriptId}</span>
							<Separator orientation="vertical" class="hidden h-4 sm:inline" />
							<Badge variant="secondary">{transcriptStatus}</Badge>
							{#if pollingTranscript}
								<span class="inline-flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-400">
									<Spinner class="size-3.5" />
									Polling…
								</span>
							{/if}
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						{#if transcriptText}
							<div class="rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed">
								{transcriptText}
							</div>
						{/if}

						{#if transcriptWords.length > 0}
							<div class="space-y-2">
								<h3 class="text-sm font-medium">Timestamped words</h3>
								<ScrollArea class="h-72 rounded-md border">
									<Table>
										<TableHeader>
											<TableRow class="hover:bg-transparent">
												<TableHead class="w-[1%] whitespace-nowrap">Start</TableHead>
												<TableHead class="w-[1%] whitespace-nowrap">End</TableHead>
												<TableHead>Word</TableHead>
												<TableHead class="w-[1%] whitespace-nowrap text-right">Conf.</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{#each transcriptWords as word}
												<TableRow>
													<TableCell class="font-mono text-muted-foreground text-xs">{formatMs(word.start)}</TableCell>
													<TableCell class="font-mono text-muted-foreground text-xs">{formatMs(word.end)}</TableCell>
													<TableCell class="text-sm">{word.text}</TableCell>
													<TableCell class="text-right font-mono text-xs">{(word.confidence * 100).toFixed(0)}%</TableCell>
												</TableRow>
											{/each}
										</TableBody>
									</Table>
								</ScrollArea>
							</div>

							<Collapsible class="space-y-2">
								<CollapsibleTrigger
									class={cn(
										buttonVariants({ variant: "ghost", size: "sm" }),
										"w-full justify-start px-0"
									)}
								>
									Raw transcript JSON (sent to LLM)
								</CollapsibleTrigger>
								<CollapsibleContent>
									<ScrollArea class="h-56 rounded-md border">
										<pre class="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{JSON.stringify(
												transcriptWords,
												null,
												2
											)}</pre>
									</ScrollArea>
								</CollapsibleContent>
							</Collapsible>
						{/if}
					</CardContent>
				</Card>
			{/if}

			{#if analyzing}
				<Alert>
					<Spinner />
					<AlertTitle>Analysis</AlertTitle>
					<AlertDescription>Analyzing transcript with the model…</AlertDescription>
				</Alert>
			{/if}

			{#if analysisError}
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>Analysis error</AlertTitle>
					<AlertDescription>{analysisError}</AlertDescription>
				</Alert>
			{/if}

			{#if segments.length > 0}
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-base">Analysis</CardTitle>
						<CardDescription>Filter segments and inspect structured output.</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="flex flex-wrap gap-x-4 gap-y-3">
							<div class="flex items-center gap-2">
								<Checkbox id="filter-good" bind:checked={showGood} />
								<Label for="filter-good" class="cursor-pointer font-normal">Good</Label>
							</div>
							<div class="flex items-center gap-2">
								<Checkbox id="filter-filler" bind:checked={showFiller} />
								<Label for="filter-filler" class="cursor-pointer font-normal">Filler words</Label>
							</div>
							<div class="flex items-center gap-2">
								<Checkbox id="filter-retake" bind:checked={showRetake} />
								<Label for="filter-retake" class="cursor-pointer font-normal">Retake</Label>
							</div>
							<div class="flex items-center gap-2">
								<Checkbox id="filter-dead" bind:checked={showDeadSpace} />
								<Label for="filter-dead" class="cursor-pointer font-normal">Dead space</Label>
							</div>
						</div>

						<ScrollArea class="h-72 rounded-md border">
							<Table>
								<TableHeader>
									<TableRow class="hover:bg-transparent">
										<TableHead class="w-[1%] whitespace-nowrap">Start</TableHead>
										<TableHead class="w-[1%] whitespace-nowrap">End</TableHead>
										<TableHead class="w-[1%]">Category</TableHead>
										<TableHead>Text</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each filteredSegments() as segment}
										<TableRow class={categoryRowClass[segment.category]}>
											<TableCell class="font-mono text-xs">{formatMs(segment.start)}</TableCell>
											<TableCell class="font-mono text-xs">{formatMs(segment.end)}</TableCell>
											<TableCell>
												{#if segment.category === "retake"}
													<Badge variant="destructive">{categoryLabels[segment.category]}</Badge>
												{:else}
													<Badge variant="outline" class={categoryBadgeClass[segment.category]}>
														{categoryLabels[segment.category]}
													</Badge>
												{/if}
											</TableCell>
											<TableCell class="text-sm">{segment.text}</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</ScrollArea>

						<Separator />

						<div class="space-y-2">
							<h3 class="text-sm font-medium">Analysis JSON</h3>
							<ScrollArea class="h-56 rounded-md border">
								<pre class="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{JSON.stringify(
										segments,
										null,
										2
									)}</pre>
							</ScrollArea>
						</div>
					</CardContent>
				</Card>
			{/if}
		</div>
	</div>
</div>
