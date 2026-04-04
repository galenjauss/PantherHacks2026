<script lang="ts">
	import { onDestroy, untrack } from "svelte";
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
	import { Slider } from "$lib/components/ui/slider";
	import type {
		AutocutAnalysisSegment,
		AutocutJobResponse,
		AutocutTranscriptWord,
		CreateAutocutJobRequest
	} from "$lib/types/autocut";
	import {
		buildAnalysisSegments,
		DEFAULT_ANALYSIS_SEGMENT_OPTIONS
	} from "$lib/video/analysis-segments";
	import { cn } from "$lib/utils.js";
	import AlertCircleIcon from "@lucide/svelte/icons/circle-alert";
	let selectedFile = $state<File | null>(null);
	let videoUrl = $state<string | null>(null);
	let videoEl = $state<HTMLVideoElement>();
	let videoDurationMs = $state<number | null>(null);
	let uploading = $state(false);
	let response = $state("");
	let error = $state("");
	let jobId = $state("");
	let pollResult = $state("");
	let isPreviewPlaying = $state(false);
	let currentSegmentIndex = $state(0);

	// Transcription state
	interface WordLabel {
		index: number;
		category: "good" | "filler_words" | "retake";
	}

	let transcribing = $state(false);
	let transcriptId = $state("");
	let transcriptStatus = $state("");
	let transcriptText = $state("");
	let transcriptWords = $state<AutocutTranscriptWord[]>([]);
	let wordLabels = $state<WordLabel[]>([]);
	let transcriptError = $state("");
	let pollingTranscript = $state(false);

	// Analysis state
	let analyzing = $state(false);
	let creatingAutocutJob = $state(false);
	let analysisError = $state("");

	// Filter state
	let showGood = $state(true);
	let showFiller = $state(true);
	let showRetake = $state(true);
	let showDeadSpace = $state(true);
	let deadSpaceThreshold = $state(DEFAULT_ANALYSIS_SEGMENT_OPTIONS.deadSpaceThresholdMs);
	let clipEndTrim = $state(DEFAULT_ANALYSIS_SEGMENT_OPTIONS.clipEndTrimMs);
	let currentTranscriptionRun = 0;
	let activeJobSyncToken = 0;
	let transcriptPollDelay: ReturnType<typeof setTimeout> | null = null;
	let previewTimeUpdateHandler: (() => void) | null = null;
	let lastSyncedAnalysisKey = "";

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

	let analysisOptions = $derived({
		deadSpaceThresholdMs: deadSpaceThreshold,
		clipEndTrimMs: clipEndTrim
	});

	let segments = $derived<AutocutAnalysisSegment[]>(
		transcriptWords.length > 0 && wordLabels.length > 0
			? buildAnalysisSegments(transcriptWords, wordLabels, analysisOptions)
			: []
	);

	onDestroy(() => {
		currentTranscriptionRun += 1;
		activeJobSyncToken += 1;
		clearTranscriptPolling();
		clearPreviewListener();
		if (videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
	});

	function isTranscriptBusy(): boolean {
		return transcribing || pollingTranscript || analyzing || creatingAutocutJob;
	}

	function transcribeButtonLabel(): string {
		if (transcribing) return "Starting auto cut...";
		if (pollingTranscript) return "Transcribing...";
		if (analyzing) return "Analyzing...";
		if (creatingAutocutJob) return "Building auto cut...";
		return "Auto Cut";
	}

	function clearTranscriptPolling() {
		if (transcriptPollDelay) {
			clearTimeout(transcriptPollDelay);
			transcriptPollDelay = null;
		}
	}

	function clearPreviewListener() {
		if (videoEl && previewTimeUpdateHandler) {
			videoEl.removeEventListener("timeupdate", previewTimeUpdateHandler);
		}

		previewTimeUpdateHandler = null;
	}

	function resetJobState() {
		error = "";
		response = "";
		jobId = "";
		pollResult = "";
	}

	function resetTranscriptionState() {
		activeJobSyncToken += 1;
		clearTranscriptPolling();
		transcribing = false;
		pollingTranscript = false;
		analyzing = false;
		creatingAutocutJob = false;
		transcriptId = "";
		transcriptStatus = "";
		transcriptText = "";
		transcriptWords = [];
		wordLabels = [];
		transcriptError = "";
		analysisError = "";
		lastSyncedAnalysisKey = "";
		stopPreview();
	}

	function handleVideoLoadedMetadata() {
		if (!videoEl) return;

		const durationSeconds = videoEl.duration;
		videoDurationMs =
			Number.isFinite(durationSeconds) && durationSeconds > 0
				? Math.round(durationSeconds * 1000)
				: null;
	}

	function waitForNextTranscriptPoll(ms: number): Promise<void> {
		return new Promise((resolve) => {
			clearTranscriptPolling();
			transcriptPollDelay = setTimeout(() => {
				transcriptPollDelay = null;
				resolve();
			}, ms);
		});
	}

	function buildAnalysisSyncKey(file: File): string {
		return JSON.stringify({
			fileName: file.name,
			fileSize: file.size,
			fileLastModified: file.lastModified,
			transcriptId,
			wordLabels,
			analysisOptions
		});
	}

	async function syncAutocutJob(
		syncKey: string,
		file: File,
		transcript: string,
		words: AutocutTranscriptWord[],
		derivedSegments: AutocutAnalysisSegment[]
	) {
		const syncToken = ++activeJobSyncToken;
		creatingAutocutJob = true;
		error = "";

		try {
			const payload: CreateAutocutJobRequest = {
				fileName: file.name,
				mimeType: file.type || "video/mp4",
				sizeBytes: file.size,
				durationMs: videoDurationMs ?? words[words.length - 1]?.end ?? undefined,
				metadata: {
					source: "test-transcribe"
				},
				options: {
					renderOutput: false
				},
				transcriptText: transcript,
				transcriptWords: words,
				analysisSegments: derivedSegments
			};

			const res = await fetch("/api/video/autocut", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			});

			const data = (await res.json()) as Partial<AutocutJobResponse> & { error?: string };

			if (syncToken !== activeJobSyncToken || syncKey !== lastSyncedAnalysisKey) return;

			response = JSON.stringify(data, null, 2);

			if (!res.ok || !data.job?.id) {
				error = data.error ?? "Failed to create autocut job";
				return;
			}

			jobId = data.job.id;
			pollResult = JSON.stringify(data, null, 2);
		} catch (err) {
			if (syncToken !== activeJobSyncToken || syncKey !== lastSyncedAnalysisKey) return;
			error = err instanceof Error ? err.message : "Autocut job request failed";
		} finally {
			if (syncToken === activeJobSyncToken && syncKey === lastSyncedAnalysisKey) {
				creatingAutocutJob = false;
			}
		}
	}

	$effect(() => {
		const file = selectedFile;

		if (!file || transcriptWords.length === 0 || wordLabels.length === 0 || analyzing) {
			if (!file || transcriptWords.length === 0 || wordLabels.length === 0) {
				lastSyncedAnalysisKey = "";
			}
			return;
		}

		const syncKey = buildAnalysisSyncKey(file);

		if (syncKey === lastSyncedAnalysisKey) {
			return;
		}

		lastSyncedAnalysisKey = syncKey;
		const transcript = transcriptText;
		const words = transcriptWords;
		untrack(() => {
			void syncAutocutJob(syncKey, file, transcript, words, segments);
		});
	});

	function filteredSegments(): AutocutAnalysisSegment[] {
		return segments.filter((s) => {
			if (s.category === "good") return showGood;
			if (s.category === "filler_words") return showFiller;
			if (s.category === "retake") return showRetake;
			if (s.category === "dead_space") return showDeadSpace;
			return true;
		});
	}

	function getDeadSpaceThresholdMs(): number {
		return analysisOptions.deadSpaceThresholdMs;
	}

	function getClipEndTrimMs(): number {
		return analysisOptions.clipEndTrimMs;
	}

	function formatMs(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const millis = ms % 1000;
		return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
	}

	function handleFileChange(e: Event) {
		currentTranscriptionRun += 1;
		const input = e.target as HTMLInputElement;
		const nextFile = input.files?.[0] ?? null;

		clearTranscriptPolling();
		clearPreviewListener();

		if (videoUrl) URL.revokeObjectURL(videoUrl);

		selectedFile = nextFile;
		videoUrl = nextFile ? URL.createObjectURL(nextFile) : null;
		videoDurationMs = null;
		resetJobState();
		resetTranscriptionState();
	}

	function getGoodSegments(): AutocutAnalysisSegment[] {
		return segments.filter((s) => s.category === "good");
	}

	function playPreview() {
		const good = getGoodSegments();
		if (!videoEl || good.length === 0) return;

		clearPreviewListener();
		isPreviewPlaying = true;
		currentSegmentIndex = 0;
		playSegment(0, good);
	}

	function playSegment(index: number, good: AutocutAnalysisSegment[]) {
		if (!videoEl || index >= good.length) {
			isPreviewPlaying = false;
			currentSegmentIndex = 0;
			clearPreviewListener();
			return;
		}

		clearPreviewListener();
		currentSegmentIndex = index;
		const seg = good[index];
		videoEl.currentTime = seg.start / 1000;
		videoEl.play();

		const onTimeUpdate = () => {
			if (!videoEl) return;
			if (videoEl.currentTime >= seg.end / 1000) {
				clearPreviewListener();
				videoEl.pause();
				// Move to the next good segment
				playSegment(index + 1, good);
			}
		};

		previewTimeUpdateHandler = onTimeUpdate;
		videoEl.addEventListener("timeupdate", onTimeUpdate);
	}

	function stopPreview() {
		clearPreviewListener();
		if (videoEl) {
			videoEl.pause();
		}
		isPreviewPlaying = false;
		currentSegmentIndex = 0;
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
		if (!selectedFile || uploading || isTranscriptBusy()) return;

		const runId = ++currentTranscriptionRun;

		resetJobState();
		resetTranscriptionState();
		transcribing = true;

		try {
			const formData = new FormData();
			formData.append("file", selectedFile);

			const res = await fetch("/api/video/transcribe", {
				method: "POST",
				body: formData
			});

			const data = await res.json();

			if (runId !== currentTranscriptionRun) return;

			if (res.ok && data.transcript_id) {
				transcriptId = data.transcript_id;
				transcriptStatus = data.status ?? "queued";
				transcribing = false;
				await pollTranscript(runId, data.transcript_id);
			} else {
				transcriptError = data.error ?? "Failed to start transcription";
			}
		} catch (err) {
			if (runId !== currentTranscriptionRun) return;
			transcriptError = err instanceof Error ? err.message : "Request failed";
		} finally {
			if (runId === currentTranscriptionRun) {
				transcribing = false;
			}
		}
	}

	async function analyzeTranscript(runId: number) {
		if (transcriptWords.length === 0) return;

		analyzing = true;
		analysisError = "";

		try {
			const res = await fetch("/api/video/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					words: transcriptWords,
					options: {
						deadSpaceThresholdMs: getDeadSpaceThresholdMs(),
						clipEndTrimMs: getClipEndTrimMs()
					}
				})
			});

			const data = await res.json();

			if (runId !== currentTranscriptionRun) return;

			if (res.ok && Array.isArray(data.labels)) {
				wordLabels = data.labels;
			} else {
				analysisError = data.error ?? "Analysis failed";
			}
		} catch (err) {
			if (runId !== currentTranscriptionRun) return;
			analysisError = err instanceof Error ? err.message : "Analysis request failed";
		} finally {
			if (runId === currentTranscriptionRun) {
				analyzing = false;
			}
		}
	}

	async function pollTranscript(runId: number, activeTranscriptId: string) {
		if (!activeTranscriptId || runId !== currentTranscriptionRun) return;

		pollingTranscript = true;

		try {
			while (runId === currentTranscriptionRun) {
				const res = await fetch(`/api/video/transcribe/${activeTranscriptId}`);
				const data = await res.json();

				if (runId !== currentTranscriptionRun) return;

				if (!res.ok) {
					transcriptError = data.error ?? `Failed to fetch transcript (${res.status})`;
					return;
				}

				transcriptStatus = data.status ?? "";

				if (data.status === "completed") {
					transcriptText = data.text ?? "";
					transcriptWords = Array.isArray(data.words) ? data.words : [];
					if (transcriptWords.length === 0) {
						transcriptError = "Transcription completed without word timestamps";
						return;
					}
					await analyzeTranscript(runId);
					return;
				}

				if (data.status === "error") {
					transcriptError = data.error ?? "Transcription failed";
					return;
				}

				await waitForNextTranscriptPoll(3000);
			}
		} catch (err) {
			if (runId !== currentTranscriptionRun) return;
			transcriptError = err instanceof Error ? err.message : "Poll failed";
		} finally {
			if (runId === currentTranscriptionRun) {
				pollingTranscript = false;
				clearTranscriptPolling();
			}
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
					<CardDescription>Select a file, preview it, and run auto cut on the real pipeline.</CardDescription>
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

					<div class="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
						<div class="space-y-3">
							<div class="flex items-center justify-between gap-3">
								<div class="space-y-1">
									<Label for="dead-space-threshold">Dead space allowed</Label>
									<p class="text-muted-foreground text-xs">
										Gaps longer than this become `dead_space` segments.
									</p>
								</div>
								<Badge variant="outline" class="font-mono">{getDeadSpaceThresholdMs()} ms</Badge>
							</div>
							<Slider
								id="dead-space-threshold"
								type="single"
								bind:value={deadSpaceThreshold}
								min={0}
								max={2000}
								step={25}
							/>
						</div>

						<div class="space-y-3">
							<div class="flex items-center justify-between gap-3">
								<div class="space-y-1">
									<Label for="clip-end-trim">Auto cut clip ends</Label>
									<p class="text-muted-foreground text-xs">
										Shortens each `good` clip by this amount at the tail.
									</p>
								</div>
								<Badge variant="outline" class="font-mono">{getClipEndTrimMs()} ms</Badge>
							</div>
							<Slider
								id="clip-end-trim"
								type="single"
								bind:value={clipEndTrim}
								min={0}
								max={1000}
								step={25}
							/>
						</div>
					</div>

					{#if videoUrl}
						<div class="overflow-hidden rounded-lg border bg-muted">
							<video
								bind:this={videoEl}
								src={videoUrl}
								class="aspect-video w-full object-contain"
								preload="auto"
								onloadedmetadata={handleVideoLoadedMetadata}
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
					<Button
						onclick={transcribe}
						disabled={!selectedFile || uploading || isTranscriptBusy()}
					>
						{transcribeButtonLabel()}
					</Button>
					{#if jobId}
						<Button onclick={pollJob} variant="outline">Poll job status</Button>
					{/if}
					<p class="text-muted-foreground w-full text-xs">
						Auto Cut runs the real transcription flow, labels words, derives segments from
						the current sliders, and syncs an autocut job from that result.
					</p>
				</CardFooter>
			</Card>
		</div>

		<!-- API output, tables, JSON (right) -->
		<div class="flex min-h-0 min-w-0 flex-col gap-6">
			{#if error}
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>Autocut job error</AlertTitle>
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
						<CardTitle class="text-base">Autocut job snapshot</CardTitle>
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
