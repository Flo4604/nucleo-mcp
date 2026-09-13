import { createHash } from "node:crypto";
import { config } from "./config";
import { fetchTeams, NucleoApiError, type NucleoTeam } from "./nucleo/api";

export interface Caller {
	userId: string;
	token: string;
	teams: NucleoTeam[];
}

export class AuthError extends Error {
	constructor(message: string, readonly status: number = 401) {
		super(message);
		this.name = "AuthError";
	}
}

interface CacheEntry {
	teams: NucleoTeam[];
	expiresAt: number;
}

/**
 * Keyed by a hash of the credential so validated tokens are not held in memory
 * in plain text for the life of the process.
 */
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, token: string): string {
	return createHash("sha256").update(`${userId}:${token}`).digest("hex");
}

function parseCredential(header: string | null): { userId: string; token: string; } {
	if (!header) throw new AuthError("missing Authorization header");

	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	if (!match?.[1]) throw new AuthError("expected an Authorization: Bearer credential");

	const separator = match[1].indexOf(":");
	if (separator < 1) {
		throw new AuthError("credential must be formatted as <nucleo-user-id>:<nucleo-token>");
	}

	const userId = match[1].slice(0, separator).trim();
	const token = match[1].slice(separator + 1).trim();
	if (!userId || !token) {
		throw new AuthError("credential must be formatted as <nucleo-user-id>:<nucleo-token>");
	}
	return { userId, token };
}

/**
 * Authenticate a caller against Nucleo itself. There is no local user list: a
 * caller is authorised exactly when Nucleo still recognises their token, which
 * is what keeps the library behind a real licence.
 */
export async function authenticate(header: string | null): Promise<Caller> {
	const { userId, token } = parseCredential(header);
	const key = cacheKey(userId, token);

	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) {
		return { userId, token, teams: hit.teams };
	}

	let teams: NucleoTeam[];
	try {
		teams = await fetchTeams(userId, token);
	} catch (err) {
		cache.delete(key);
		if (err instanceof NucleoApiError) {
			throw new AuthError("Nucleo rejected these credentials", err.status === 502 ? 502 : 401);
		}
		throw new AuthError("could not reach Nucleo to verify credentials", 503);
	}

	cache.set(key, { teams, expiresAt: Date.now() + config.authCacheTtlMs });
	return { userId, token, teams };
}

/** Drop expired entries so the map cannot grow without bound. */
export function startAuthCacheSweeper(): void {
	setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of cache) {
			if (entry.expiresAt <= now) cache.delete(key);
		}
	}, 10 * 60_000);
}
