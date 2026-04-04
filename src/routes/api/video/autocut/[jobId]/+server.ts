import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { getAutocutJob } from "$lib/server/autocut-jobs";
import type { AutocutApiErrorResponse, AutocutJobResponse } from "$lib/types/autocut";

export const GET: RequestHandler = async ({ params }) => {
	const job = getAutocutJob(params.jobId);

	if (!job) {
		const response: AutocutApiErrorResponse = {
			error: `Auto-cut job "${params.jobId}" was not found.`
		};

		return json(response, { status: 404 });
	}

	const response: AutocutJobResponse = { job };

	return json(response);
};
