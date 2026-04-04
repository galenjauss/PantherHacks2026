import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { createAutocutJob, listAutocutJobs } from "$lib/server/autocut-jobs";
import {
	AUTOCUT_OUTPUT_FORMATS,
	AUTOCUT_TARGET_ASPECT_RATIOS,
	DEFAULT_AUTOCUT_JOB_OPTIONS,
	type AutocutApiErrorResponse,
	type AutocutJobListResponse,
	type AutocutJobOptions,
	type AutocutJobResponse,
	type AutocutSource,
	type CreateAutocutJobRequest
} from "$lib/types/autocut";

const DEFAULT_SOURCE_DURATION_MS = 42_000;
const DEFAULT_FILE_NAME = "demo-upload.mp4";
const DEFAULT_MIME_TYPE = "video/mp4";

function parseBoolean(value: FormDataEntryValue | null): boolean | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const normalizedValue = value.trim().toLowerCase();

	if (["true", "1", "yes", "on"].includes(normalizedValue)) {
		return true;
	}

	if (["false", "0", "no", "off"].includes(normalizedValue)) {
		return false;
	}

	return undefined;
}

function parseNumber(value: FormDataEntryValue | null): number | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const parsedValue = Number(value);

	return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function getFirstFormValue(formData: FormData, ...keys: string[]): FormDataEntryValue | null {
	for (const key of keys) {
		const value = formData.get(key);

		if (value !== null) {
			return value;
		}
	}

	return null;
}

function parseAspectRatio(value: FormDataEntryValue | null): AutocutJobOptions["targetAspectRatio"] | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	return AUTOCUT_TARGET_ASPECT_RATIOS.find((candidate) => candidate === value);
}

function parseOutputFormat(value: FormDataEntryValue | null): AutocutJobOptions["outputFormat"] | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	return AUTOCUT_OUTPUT_FORMATS.find((candidate) => candidate === value);
}

function mergeOptions(options?: Partial<AutocutJobOptions>): AutocutJobOptions {
	return {
		...DEFAULT_AUTOCUT_JOB_OPTIONS,
		...options
	};
}

async function parseCreateRequest(request: Request): Promise<CreateAutocutJobRequest> {
	const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

	if (contentType.includes("application/json")) {
		const payload = await request.json();

		if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
			throw new Error("JSON request body must be an object.");
		}

		return payload as CreateAutocutJobRequest;
	}

	if (
		contentType.includes("multipart/form-data") ||
		contentType.includes("application/x-www-form-urlencoded")
	) {
		const formData = await request.formData();
		const fileEntry = getFirstFormValue(formData, "file");
		const file = fileEntry instanceof File ? fileEntry : null;

		const metadata: Record<string, string> = {};

		for (const [key, value] of formData.entries()) {
			if (key.startsWith("metadata.") && typeof value === "string") {
				metadata[key.slice("metadata.".length)] = value;
			}
		}

		return {
			sourceUrl:
				(typeof getFirstFormValue(formData, "sourceUrl") === "string"
					? (getFirstFormValue(formData, "sourceUrl") as string)
					: undefined) ?? undefined,
			fileName: file?.name ?? (getFirstFormValue(formData, "fileName") as string | null) ?? undefined,
			mimeType:
				file?.type ||
				((getFirstFormValue(formData, "mimeType") as string | null) ?? undefined),
			sizeBytes: file?.size ?? parseNumber(getFirstFormValue(formData, "sizeBytes")),
			durationMs: parseNumber(getFirstFormValue(formData, "durationMs")),
			language:
				((getFirstFormValue(formData, "language") as string | null) ?? undefined) ?? undefined,
			speakersExpected: parseNumber(getFirstFormValue(formData, "speakersExpected")),
			metadata,
			options: {
				removeSilence: parseBoolean(
					getFirstFormValue(formData, "options.removeSilence", "removeSilence")
				),
				trimFillerWords: parseBoolean(
					getFirstFormValue(formData, "options.trimFillerWords", "trimFillerWords")
				),
				detectRetakes: parseBoolean(
					getFirstFormValue(formData, "options.detectRetakes", "detectRetakes")
				),
				renderOutput: parseBoolean(
					getFirstFormValue(formData, "options.renderOutput", "renderOutput")
				),
				targetAspectRatio: parseAspectRatio(
					getFirstFormValue(
						formData,
						"options.targetAspectRatio",
						"targetAspectRatio"
					)
				),
				outputFormat: parseOutputFormat(
					getFirstFormValue(formData, "options.outputFormat", "outputFormat")
				)
			}
		};
	}

	return {};
}

function inferFileName(sourceUrl?: string): string | undefined {
	if (!sourceUrl) {
		return undefined;
	}

	try {
		const pathname = new URL(sourceUrl).pathname;
		const fileName = pathname.split("/").filter(Boolean).at(-1);

		return fileName || undefined;
	} catch {
		return undefined;
	}
}

function normalizeSource(payload: CreateAutocutJobRequest): AutocutSource {
	return {
		fileName: payload.fileName?.trim() || inferFileName(payload.sourceUrl) || DEFAULT_FILE_NAME,
		mimeType: payload.mimeType?.trim() || DEFAULT_MIME_TYPE,
		sizeBytes: payload.sizeBytes ?? null,
		durationMs: payload.durationMs && payload.durationMs > 0 ? payload.durationMs : DEFAULT_SOURCE_DURATION_MS,
		sourceUrl: payload.sourceUrl?.trim() || null
	};
}

export const GET: RequestHandler = async () => {
	const response: AutocutJobListResponse = {
		jobs: listAutocutJobs(),
		defaults: DEFAULT_AUTOCUT_JOB_OPTIONS,
		supportedInputTypes: ["application/json", "multipart/form-data"]
	};

	return json(response);
};

export const POST: RequestHandler = async ({ request, url }) => {
	let payload: CreateAutocutJobRequest;

	try {
		payload = await parseCreateRequest(request);
	} catch (error) {
		const response: AutocutApiErrorResponse = {
			error: error instanceof Error ? error.message : "Invalid request body."
		};

		return json(response, { status: 400 });
	}

	const job = createAutocutJob({
		source: normalizeSource(payload),
		options: mergeOptions(payload.options),
		metadata: payload.metadata ?? {},
		language: payload.language?.trim() || "en",
		speakersExpected:
			payload.speakersExpected && payload.speakersExpected > 0 ? payload.speakersExpected : null
	});

	const response: AutocutJobResponse = { job };

	return json(response, {
		status: 201,
		headers: {
			location: new URL(`/api/video/autocut/${job.id}`, url).toString()
		}
	});
};
