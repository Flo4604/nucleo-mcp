import { unzipSync } from "fflate";
import { fetchLibraryPointer, NucleoApiError } from "./api";
import type { GroupDef } from "./groups";

export interface RawSet {
	id: number;
	label: string;
}

export interface RawIcon {
	id: number;
	name: string;
	fill: string | null;
	svg: string;
	size: number | null;
	tags: string[];
	setIds: number[];
	lastUpdate: number;
}

export interface Library {
	timestamp: number;
	sets: RawSet[];
	icons: RawIcon[];
}

/** Sizes arrive as "24px" and the array can contain nulls, so pick the first usable one. */
function parseSize(sizes: unknown): number | null {
	if (!Array.isArray(sizes)) return null;
	for (const entry of sizes) {
		if (typeof entry !== "string") continue;
		const parsed = Number.parseInt(entry, 10);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return null;
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === "string");
}

function toNumberArray(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return value.map((v) => Number(v)).filter((v) => Number.isFinite(v));
}

function parseLibrary(json: string): Library {
	const parsed = JSON.parse(json) as {
		timestamp?: number;
		sets?: { id: number; label: string; }[];
		icons?: Record<string, unknown>[];
	};

	const sets = (parsed.sets ?? []).map((s) => ({ id: Number(s.id), label: String(s.label ?? "") }));

	const icons: RawIcon[] = [];
	for (const raw of parsed.icons ?? []) {
		const id = Number(raw.id);
		if (!Number.isFinite(id)) continue;

		// Every icon observed carries exactly one fill, but guard anyway.
		const fills = toStringArray(raw.fills);

		icons.push({
			id,
			name: String(raw.label ?? ""),
			fill: fills[0] ?? null,
			svg: typeof raw.svg === "string" ? raw.svg : "",
			size: parseSize(raw.sizes),
			tags: toStringArray(raw.tags),
			setIds: toNumberArray(raw.categories),
			lastUpdate: Number(raw.last_update ?? 0),
		});
	}

	return { timestamp: Number(parsed.timestamp ?? 0), sets, icons };
}

/**
 * Download and unpack one family's archive. Each zip holds a single icons.json
 * carrying the sets, the icons, and the SVG markup itself.
 */
export async function downloadLibrary(
	group: GroupDef,
	token: string,
): Promise<{ library: Library; lastUpdate: number; }> {
	const pointer = await fetchLibraryPointer(group.database, token);

	const res = await fetch(pointer.url);
	if (!res.ok) {
		throw new NucleoApiError(`${group.key} archive download failed: ${res.status}`, res.status);
	}

	const zipped = new Uint8Array(await res.arrayBuffer());
	const entries = unzipSync(zipped);

	const entry = entries["icons.json"] ?? Object.values(entries)[0];
	if (!entry) throw new NucleoApiError(`${group.key} archive was empty`, 502);

	const library = parseLibrary(new TextDecoder().decode(entry));
	return { library, lastUpdate: pointer.lastUpdate || library.timestamp };
}
