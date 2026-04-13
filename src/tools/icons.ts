import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq, like, or } from "drizzle-orm";
import { readFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { db, schema } from "../db";
import { HOME, SETS_PATH } from "../paths";

function svgPath(setId: number, iconId: number) {
	return join(SETS_PATH, String(setId), `${iconId}.svg`);
}

export function registerIconTools(server: McpServer) {
	server.tool(
		"search_icons",
		"Search icons by name or tag. Filter by style, group name, or set ID.",
		{
			query: z.string().describe("Search term to match against icon name and tags"),
			style: z
				.enum(["glyph", "colored", "outline", "outline-duo", "glyph-duo"])
				.optional()
				.describe("Icon style filter"),
			group: z
				.string()
				.optional()
				.describe("Group/family name filter (e.g. 'Nucleo UI', 'Nucleo Pixel')"),
			set_id: z.number().optional().describe("Filter by specific set ID"),
			limit: z
				.number()
				.min(1)
				.max(100)
				.default(50)
				.optional()
				.describe("Max results (default 50, max 100)"),
		},
		async ({ query, style, group, set_id, limit }) => {
			const term = `%${query}%`;
			const conditions = [
				or(
					like(schema.icons.name, term),
					like(schema.icons.tags, term),
					like(schema.icons.nucleoTags, term),
				),
			];

			if (style) conditions.push(eq(schema.icons.klass, style));
			if (group) conditions.push(like(schema.groups.title, `%${group}%`));
			if (set_id) conditions.push(eq(schema.icons.setId, set_id));

			const rows = await db
				.select({
					id: schema.icons.id,
					name: schema.icons.name,
					style: schema.icons.klass,
					tags: schema.icons.tags,
					nucleoTags: schema.icons.nucleoTags,
					setName: schema.sets.title,
					groupName: schema.groups.title,
					setId: schema.icons.setId,
				})
				.from(schema.icons)
				.innerJoin(schema.sets, eq(schema.icons.setId, schema.sets.id))
				.innerJoin(schema.groups, eq(schema.sets.groupId, schema.groups.id))
				.where(and(...conditions))
				.orderBy(asc(schema.icons.name))
				.limit(Math.min(limit ?? 50, 100));

			return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
		},
	);

	server.tool(
		"get_icon_svg",
		"Get the raw SVG content for an icon by its ID.",
		{ icon_id: z.number().describe("The icon ID") },
		async ({ icon_id }) => {
			const [row] = await db
				.select({
					id: schema.icons.id,
					name: schema.icons.name,
					setId: schema.icons.setId,
					klass: schema.icons.klass,
				})
				.from(schema.icons)
				.where(eq(schema.icons.id, icon_id))
				.limit(1);

			if (!row) {
				return { content: [{ type: "text", text: `Icon ${icon_id} not found` }], isError: true };
			}

			try {
				const svg = await readFile(svgPath(row.setId!, row.id), "utf-8");
				return { content: [{ type: "text", text: `# ${row.name} (${row.klass})\n\n${svg}` }] };
			} catch {
				return { content: [{ type: "text", text: `SVG file not found` }], isError: true };
			}
		},
	);

	server.tool(
		"export_icon_pdf",
		"Export an icon to a vector PDF via rsvg-convert.",
		{
			icon_id: z.number().describe("The icon ID to export"),
			output_path: z
				.string()
				.optional()
				.describe("Output PDF path (defaults to ~/Downloads/{icon_name}.pdf)"),
		},
		async ({ icon_id, output_path }) => {
			const [row] = await db
				.select({
					id: schema.icons.id,
					name: schema.icons.name,
					setId: schema.icons.setId,
				})
				.from(schema.icons)
				.where(eq(schema.icons.id, icon_id))
				.limit(1);

			if (!row) {
				return { content: [{ type: "text", text: `Icon ${icon_id} not found` }], isError: true };
			}

			const input = svgPath(row.setId!, row.id);
			const output = output_path ?? join(HOME, "Downloads", `${row.name}.pdf`);

			const proc = Bun.spawn(["rsvg-convert", "-f", "pdf", "-o", output, input]);
			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				return {
					content: [{ type: "text", text: `rsvg-convert failed with exit code ${exitCode}` }],
					isError: true,
				};
			}
			return { content: [{ type: "text", text: `Exported to ${output}` }] };
		},
	);
}
