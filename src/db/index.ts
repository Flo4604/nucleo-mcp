import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";
import * as schema from "./schema";

mkdirSync(dirname(config.dbPath), { recursive: true });

const sqlite = new Database(config.dbPath, { create: true });

// WAL keeps the sync transaction from blocking in-flight searches.
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA synchronous = NORMAL");
sqlite.exec("PRAGMA foreign_keys = ON");

sqlite.exec(`
	CREATE TABLE IF NOT EXISTS groups (
		key TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		last_update INTEGER NOT NULL DEFAULT 0,
		icon_count INTEGER NOT NULL DEFAULT 0,
		synced_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS sets (
		id INTEGER PRIMARY KEY,
		group_key TEXT NOT NULL,
		label TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS sets_group_idx ON sets (group_key);
	CREATE TABLE IF NOT EXISTS icons (
		id INTEGER PRIMARY KEY,
		group_key TEXT NOT NULL,
		name TEXT NOT NULL,
		fill TEXT,
		svg TEXT NOT NULL,
		size INTEGER,
		tags TEXT NOT NULL DEFAULT '[]',
		last_update INTEGER NOT NULL DEFAULT 0,
		search TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS icons_group_idx ON icons (group_key);
	CREATE INDEX IF NOT EXISTS icons_fill_idx ON icons (fill);
	CREATE INDEX IF NOT EXISTS icons_search_idx ON icons (search);
	CREATE INDEX IF NOT EXISTS icons_name_idx ON icons (name);
	CREATE TABLE IF NOT EXISTS icon_sets (
		icon_id INTEGER NOT NULL,
		set_id INTEGER NOT NULL,
		PRIMARY KEY (icon_id, set_id)
	);
	CREATE INDEX IF NOT EXISTS icon_sets_set_idx ON icon_sets (set_id);
`);

// Pass the client explicitly: drizzle() has no positional Database overload, and a
// bare instance silently falls through to a fresh in-memory database.
export const db = drizzle({ client: sqlite, schema });
export { schema, sqlite };
