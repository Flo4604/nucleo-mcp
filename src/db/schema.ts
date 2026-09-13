import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One row per icon family, carrying the watermark used to skip unchanged syncs. */
export const groups = sqliteTable("groups", {
	key: text("key").primaryKey(),
	title: text("title").notNull(),
	lastUpdate: integer("last_update").notNull().default(0),
	iconCount: integer("icon_count").notNull().default(0),
	syncedAt: integer("synced_at"),
});

export const sets = sqliteTable("sets", {
	id: integer("id").primaryKey(),
	groupKey: text("group_key").notNull(),
	label: text("label").notNull(),
}, (t) => [index("sets_group_idx").on(t.groupKey)]);

export const icons = sqliteTable("icons", {
	id: integer("id").primaryKey(),
	groupKey: text("group_key").notNull(),
	name: text("name").notNull(),
	/** Exactly one of glyph, outline, outline-duo, glyph-duo. */
	fill: text("fill"),
	/** Inner markup only. It has no <svg> wrapper; see src/svg.ts. */
	svg: text("svg").notNull(),
	size: integer("size"),
	tags: text("tags").notNull().default("[]"),
	lastUpdate: integer("last_update").notNull().default(0),
	/** Lowercased name and tags, so search is one indexed LIKE instead of a join. */
	search: text("search").notNull(),
}, (t) => [
	index("icons_group_idx").on(t.groupKey),
	index("icons_fill_idx").on(t.fill),
	index("icons_search_idx").on(t.search),
	index("icons_name_idx").on(t.name),
]);

/** Icons belong to zero or more sets, so the mapping needs its own table. */
export const iconSets = sqliteTable("icon_sets", {
	iconId: integer("icon_id").notNull(),
	setId: integer("set_id").notNull(),
}, (t) => [
	primaryKey({ columns: [t.iconId, t.setId] }),
	index("icon_sets_set_idx").on(t.setId),
]);
