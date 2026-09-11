import { eq, sql } from "drizzle-orm";
import { config } from "../config";
import { db, schema, sqlite } from "../db";
import { type GroupDef, GROUPS } from "../nucleo/groups";
import { downloadLibrary, type Library } from "../nucleo/library";

/** Rows per INSERT. SQLite caps bound variables, so chunk rather than binding 40k rows at once. */
const ICON_CHUNK = 500;
const SET_CHUNK = 2000;

function chunk<T>(rows: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
	return out;
}

export interface GroupStatus {
	key: string;
	title: string;
	iconCount: number;
	lastUpdate: number;
	syncedAt: number | null;
}

export function groupStatuses(): GroupStatus[] {
	return db.select().from(schema.groups).all().map((g) => ({
		key: g.key,
		title: g.title,
		iconCount: g.iconCount,
		lastUpdate: g.lastUpdate,
		syncedAt: g.syncedAt,
	}));
}

function storedWatermark(key: string): { lastUpdate: number; iconCount: number; } | null {
	const row = db.select().from(schema.groups).where(eq(schema.groups.key, key)).get();
	return row ? { lastUpdate: row.lastUpdate, iconCount: row.iconCount } : null;
}

/**
 * Replace one family's rows with the downloaded snapshot. Nucleo has no delta
 * endpoint -- the "incremental" URL returns the same full archive -- so the
 * cheapest correct thing is to rewrite the family inside one transaction.
 */
function persist(group: GroupDef, library: Library, lastUpdate: number): void {
	const setRows = library.sets.map((s) => ({
		id: s.id,
		groupKey: group.key,
		label: s.label,
	}));

	const iconRows = library.icons.map((icon) => ({
		id: icon.id,
		groupKey: group.key,
		name: icon.name,
		fill: icon.fill,
		svg: icon.svg,
		size: icon.size,
		tags: JSON.stringify(icon.tags),
		lastUpdate: icon.lastUpdate,
		search: `${icon.name} ${icon.tags.join(" ")}`.toLowerCase(),
	}));

	const membershipRows = library.icons.flatMap((icon) => icon.setIds.map((setId) => ({ iconId: icon.id, setId })));

	const apply = sqlite.transaction(() => {
		db.delete(schema.iconSets).where(
			sql`icon_id IN (SELECT id FROM icons WHERE group_key = ${group.key})`,
		).run();
		db.delete(schema.icons).where(eq(schema.icons.groupKey, group.key)).run();
		db.delete(schema.sets).where(eq(schema.sets.groupKey, group.key)).run();

		for (const rows of chunk(setRows, SET_CHUNK)) {
			db.insert(schema.sets).values(rows).run();
		}
		for (const rows of chunk(iconRows, ICON_CHUNK)) {
			db.insert(schema.icons).values(rows).run();
		}
		for (const rows of chunk(membershipRows, SET_CHUNK)) {
			db.insert(schema.iconSets).values(rows).onConflictDoNothing().run();
		}

		db.insert(schema.groups).values({
			key: group.key,
			title: group.title,
			lastUpdate,
			iconCount: iconRows.length,
			syncedAt: Date.now(),
		}).onConflictDoUpdate({
			target: schema.groups.key,
			set: {
				title: group.title,
				lastUpdate,
				iconCount: iconRows.length,
				syncedAt: Date.now(),
			},
		}).run();
	});

	apply();
}

export async function syncGroup(group: GroupDef, force = false): Promise<"updated" | "skipped"> {
	const stored = storedWatermark(group.key);
	const { library, lastUpdate } = await downloadLibrary(group, config.syncToken);

	// The archive is fetched before this check because the pointer call is what
	// reveals last_update; skipping only avoids the far costlier write.
	if (!force && stored && stored.iconCount > 0 && stored.lastUpdate >= lastUpdate) {
		return "skipped";
	}

	persist(group, library, lastUpdate);
	return "updated";
}

/** Sync every family the account can reach, tolerating families it cannot. */
export async function syncAll(force = false): Promise<void> {
	for (const group of GROUPS) {
		const started = Date.now();
		try {
			const result = await syncGroup(group, force);
			const elapsed = Date.now() - started;
			if (result === "updated") {
				const count = storedWatermark(group.key)?.iconCount ?? 0;
				console.log(`sync ${group.key}: updated ${count} icons in ${elapsed}ms`);
			} else {
				console.log(`sync ${group.key}: already current`);
			}
		} catch (err) {
			// One family being unavailable on this licence must not stall the rest.
			console.error(`sync ${group.key}: ${(err as Error).message}`);
		}
	}
}

export function startSyncLoop(): void {
	const run = (force: boolean) => {
		syncAll(force).catch((err) => console.error("sync failed:", err));
	};

	const empty = db.select({ n: sql<number>`count(*)` }).from(schema.icons).get()?.n ?? 0;
	console.log(empty === 0 ? "library empty, seeding from Nucleo" : `library holds ${empty} icons`);

	run(false);
	setInterval(() => run(false), config.syncIntervalMs);
}
