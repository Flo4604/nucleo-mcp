import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { GROUP_KEYS } from "../nucleo/groups";
import { groupStatuses } from "../sync";

export function registerSetTools(server: McpServer): void {
	server.registerTool("list_groups", {
		title: "List icon families",
		description: "List the Nucleo icon families held by this server, with icon counts and when each "
			+ "was last synced from Nucleo.",
		inputSchema: {},
	}, async () => ({
		content: [{
			type: "text" as const,
			text: JSON.stringify(
				groupStatuses().map((g) => ({
					...g,
					syncedAt: g.syncedAt ? new Date(g.syncedAt).toISOString() : null,
				})),
				null,
				2,
			),
		}],
	}));

	server.registerTool("list_sets", {
		title: "List icon sets",
		description: "List icon sets, optionally restricted to one family.",
		inputSchema: {
			group: z.enum(GROUP_KEYS as [string, ...string[]]).optional()
				.describe("Icon family: axis (Nucleo UI), core, micro, sharp, pixel"),
		},
	}, async ({ group }) => {
		// The count comes from a grouped join, not a per-set follow-up query.
		const rows = db
			.select({
				id: schema.sets.id,
				label: schema.sets.label,
				group: schema.sets.groupKey,
				iconCount: sql<number>`count(${schema.iconSets.iconId})`,
			})
			.from(schema.sets)
			.leftJoin(schema.iconSets, eq(schema.iconSets.setId, schema.sets.id))
			.where(group ? eq(schema.sets.groupKey, group) : undefined)
			.groupBy(schema.sets.id)
			.orderBy(asc(schema.sets.groupKey), asc(schema.sets.label))
			.all();

		return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
	});
}
