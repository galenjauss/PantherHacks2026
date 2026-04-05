const ALLOWED_BLOB_HOSTS = [
	".public.blob.vercel-storage.com",
	".blob.vercel-storage.com"
];

export function isAllowedBlobUrl(raw: unknown): raw is string {
	if (typeof raw !== "string" || raw.length === 0) return false;
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:") return false;
		return ALLOWED_BLOB_HOSTS.some((suffix) => url.hostname.endsWith(suffix));
	} catch {
		return false;
	}
}
