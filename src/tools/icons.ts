import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { GROUP_KEYS } from "../nucleo/groups";
import { DEFAULT_COLOR, renderSvg } from "../svg";

const FILLS = ["glyph", "outline", "outline-duo", "glyph-duo"] as const;

function json(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(message: string) {
	return { content: [{ type: "text" as const, text: message }], isError: true };
}

function setsForIcons(iconIds: number[]): Map<number, { id: number; label: string; }[]> {
	const grouped = new Map<number, { id: number; label: string; }[]>();
	if (iconIds.length === 0) return grouped;

	// One query for every icon in the page, never one query per icon.
	const rows = db
		.select({
			iconId: schema.iconSets.iconId,
			setId: schema.sets.id,
			label: schema.sets.label,
		})
		.from(schema.iconSets)
		.innerJoin(schema.sets, eq(schema.iconSets.setId, schema.sets.id))
		.where(inArray(schema.iconSets.iconId, iconIds))
		.all();

	for (const row of rows) {
		const list = grouped.get(row.iconId) ?? [];
		list.push({ id: row.setId, label: row.label });
		grouped.set(row.iconId, list);
	}
	return grouped;
}

export function registerIconTools(server: McpServer): void {
	server.registerTool("search_icons", {
		title: "Search icons",
		description: "Search the Nucleo library by name or tag. Filter by style, icon family, or set. "
			+ "Returns icon IDs for use with get_icon_svg and export_icon_pdf.",
		inputSchema: {
			query: z.string().min(1).describe("Term matched against icon name and tags"),
			style: z.enum(FILLS).optional().describe("Icon style filter"),
			group: z.enum(GROUP_KEYS as [string, ...string[]]).optional()
				.describe("Icon family: axis (Nucleo UI), core, micro, sharp, pixel"),
			set_id: z.number().int().optional().describe("Restrict to one set"),
			limit: z.number().int().min(1).max(100).default(50).optional(),
		},
	}, async ({ query, style, group, set_id, limit }) => {
		const term = query.trim().toLowerCase();
		const max = Math.min(limit ?? 50, 100);

		const filters: SQL[] = [sql`${schema.icons.search} LIKE ${`%${term}%`}`];
		if (style) filters.push(eq(schema.icons.fill, style));
		if (group) filters.push(eq(schema.icons.groupKey, group));
		if (set_id !== undefined) {
			filters.push(
				sql`EXISTS (SELECT 1 FROM icon_sets WHERE icon_sets.icon_id = ${schema.icons.id}
					AND icon_sets.set_id = ${set_id})`,
			);
		}

		// Rank exact names above prefixes above tag-only hits, so "home" leads with "home".
		const rank = sql`CASE
			WHEN LOWER(${schema.icons.name}) = ${term} THEN 0
			WHEN LOWER(${schema.icons.name}) LIKE ${`${term}%`} THEN 1
			WHEN LOWER(${schema.icons.name}) LIKE ${`%${term}%`} THEN 2
			ELSE 3 END`;

		const rows = db
			.select({
				id: schema.icons.id,
				name: schema.icons.name,
				style: schema.icons.fill,
				group: schema.icons.groupKey,
				size: schema.icons.size,
				tags: schema.icons.tags,
			})
			.from(schema.icons)
			.where(and(...filters))
			// Group and fill break ties so repeated searches return a stable order.
			.orderBy(rank, schema.icons.name, schema.icons.groupKey, schema.icons.fill, schema.icons.size)
			.limit(max)
			.all();

		const sets = setsForIcons(rows.map((r) => r.id));

		return json({
			count: rows.length,
			icons: rows.map((row) => ({
				...row,
				tags: JSON.parse(row.tags) as string[],
				sets: sets.get(row.id) ?? [],
			})),
		});
	});

	server.registerTool("get_icon_svg", {
		title: "Get icon SVG",
		description: "Return the complete SVG markup for an icon by ID.",
		inputSchema: {
			icon_id: z.number().int().describe("The icon ID"),
			color: z.string().default("currentColor").optional()
				.describe("Fill colour, e.g. currentColor or #1D1F21"),
		},
	}, async ({ icon_id, color }) => {
		const icon = db.select().from(schema.icons).where(eq(schema.icons.id, icon_id)).get();
		if (!icon) return failure(`Icon ${icon_id} not found`);

		const svg = renderSvg(icon.svg, icon.size, color ?? "currentColor");
		return {
			content: [{
				type: "text" as const,
				text: `# ${icon.name} (${icon.fill ?? "unknown"}, ${icon.groupKey})\n\n${svg}`,
			}],
		};
	});

	server.registerTool("export_icon_pdf", {
		title: "Export icon as PDF",
		description: "Render an icon to a vector PDF and return it base64-encoded. "
			+ "The server has no access to the caller's filesystem, so the caller writes the file.",
		inputSchema: {
			icon_id: z.number().int().describe("The icon ID to export"),
			color: z.string().default(DEFAULT_COLOR).optional().describe("Fill colour"),
		},
	}, async ({ icon_id, color }) => {
		const icon = db.select().from(schema.icons).where(eq(schema.icons.id, icon_id)).get();
		if (!icon) return failure(`Icon ${icon_id} not found`);

		const svg = renderSvg(icon.svg, icon.size, color ?? DEFAULT_COLOR);

		const proc = Bun.spawn(["rsvg-convert", "-f", "pdf"], {
			stdin: new TextEncoder().encode(svg),
			stdout: "pipe",
			stderr: "pipe",
		});
		const pdf = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
		const exitCode = await proc.exited;

		if (exitCode !== 0 || pdf.byteLength === 0) {
			const stderr = await new Response(proc.stderr).text();
			return failure(`rsvg-convert failed (exit ${exitCode}): ${stderr.trim()}`);
		}

		return {
			content: [
				{ type: "text" as const, text: `${icon.name}.pdf (${pdf.byteLength} bytes, base64)` },
				{ type: "text" as const, text: Buffer.from(pdf).toString("base64") },
			],
		};
	});
}
