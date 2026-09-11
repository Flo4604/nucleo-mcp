const ICON_API = "https://nucleoapp.com/api";
const TEAM_SYNC_API = "https://nucleo-team-sync.uc.r.appspot.com";

export interface NucleoTeam {
	id: string;
	label?: string;
	admin?: string;
	pro?: string;
	legacy?: number | string;
	read_only?: string;
}

export class NucleoApiError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		this.name = "NucleoApiError";
	}
}

/**
 * Fetch the teams a user belongs to. Doubles as credential validation: Nucleo
 * rejects the request when the token is bad or the licence has lapsed.
 */
export async function fetchTeams(userId: string, token: string): Promise<NucleoTeam[]> {
	const res = await fetch(
		`${ICON_API}/users/${encodeURIComponent(userId)}/teams?token=${encodeURIComponent(token)}`,
	);
	if (!res.ok) throw new NucleoApiError(`teams lookup failed: ${res.status}`, res.status);

	const body = (await res.json()) as { data?: unknown; errors?: { details?: string; }; };
	if (body.errors) throw new NucleoApiError(body.errors.details ?? "rejected", 403);

	const teams = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : null;
	if (!teams) throw new NucleoApiError("unexpected teams response", 502);
	return teams as NucleoTeam[];
}

export interface LibraryPointer {
	url: string;
	lastUpdate: number;
}

/**
 * Ask Nucleo where the current archive for a library family lives. The returned
 * URL is a presigned S3 link that expires in about two minutes, so download it
 * immediately rather than caching it.
 */
export async function fetchLibraryPointer(
	database: string,
	token: string,
): Promise<LibraryPointer> {
	const res = await fetch(`${ICON_API}/${database}/latest?token=${encodeURIComponent(token)}`);
	if (!res.ok) throw new NucleoApiError(`${database} pointer failed: ${res.status}`, res.status);

	const body = (await res.json()) as {
		data?: { file_path?: string; last_update?: number; };
		errors?: { code?: number; details?: string; };
	};
	if (body.errors) {
		throw new NucleoApiError(body.errors.details ?? `${database} unavailable`, 403);
	}
	if (!body.data?.file_path) throw new NucleoApiError(`${database} returned no archive`, 502);

	return { url: body.data.file_path, lastUpdate: Number(body.data.last_update ?? 0) };
}

/** Call the team sync service, which owns projects (collections). */
export async function teamSync(
	method: "GET" | "POST",
	path: string,
	body?: Record<string, unknown>,
): Promise<unknown> {
	const init: RequestInit = {
		method,
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
	};
	if (method === "POST" && body) {
		init.body = new URLSearchParams(
			Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
		);
	}

	const res = await fetch(`${TEAM_SYNC_API}/${path}`, init);
	if (!res.ok) {
		throw new NucleoApiError(`${method} ${path}: ${res.status} ${await res.text()}`, res.status);
	}
	return res.json();
}
