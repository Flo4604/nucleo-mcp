import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { asc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";

export function registerSetTools(server: McpServer) {
	server.tool(
		"list_groups",
		"List all Nucleo icon groups/families (e.g. UI, Core, Micro Bold, Sharp, Pixel) with icon counts.",
		{},
		async () => {
			const rows = await db
				.select({
					id: schema.groups.id,
					title: schema.groups.title,
					iconsCount: schema.groups.iconsCount,
				})
				.from(schema.groups)
				.orderBy(asc(schema.groups.order));

			return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
		},
	);

	server.tool(
		"list_sets",
		"List all icon sets, optionally filtered by group name.",
		{
			group: z
				.string()
				.optional()
				.describe("Filter by group name (e.g. 'Nucleo UI', 'Nucleo Core', 'Nucleo Pixel')"),
		},
		async ({ group }) => {
			let query = db
				.select({
					id: schema.sets.id,
					title: schema.sets.title,
					iconsCount: schema.sets.iconsCount,
					groupName: schema.groups.title,
				})
				.from(schema.sets)
				.innerJoin(schema.groups, eq(schema.sets.groupId, schema.groups.id))
				.$dynamic();

			if (group) {
				query = query.where(like(schema.groups.title, `%${group}%`));
			}

			const rows = await query.orderBy(asc(schema.groups.order), asc(schema.sets.order));

			return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
		},
	);
}
