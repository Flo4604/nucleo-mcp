function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable ${name}`);
	return value;
}

function int(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
	return parsed;
}

const dataDir = process.env.DATA_DIR ?? "/data";

export const config = {
	port: int("PORT", 8080),
	dataDir,
	dbPath: process.env.DB_PATH ?? `${dataDir}/nucleo.db`,

	/**
	 * Credentials the server itself uses to mirror the icon library. These belong to
	 * one Nucleo account; every caller is authenticated separately against their own.
	 */
	syncUserId: required("NUCLEO_USER_ID"),
	syncToken: required("NUCLEO_TOKEN"),

	/** How often to re-check Nucleo for a newer library. */
	syncIntervalMs: int("SYNC_INTERVAL_MINUTES", 360) * 60_000,

	/** How long a validated caller credential stays trusted before revalidation. */
	authCacheTtlMs: int("AUTH_CACHE_MINUTES", 60) * 60_000,

	/** Temp scratch space for downloading library archives. */
	tmpDir: process.env.TMPDIR ?? "/tmp",
} as const;
