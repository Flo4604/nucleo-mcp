import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, sql } from "drizzle-orm";
import { readFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { nucleoApi } from "../api";
import { decryptAccountData } from "../auth";
import { db, schema, writeDb } from "../db";
import { NC_PROJECTS_PATH, SETS_PATH } from "../paths";

const account = decryptAccountData();

function getTeam() {
	const [team] = db.select().from(schema.teams).limit(1).all();
	if (!team) throw new Error("No team found in local Nucleo database");
	return team;
}

export function registerProjectTools(server: McpServer) {
	server.tool("list_projects", "List all Nucleo projects (collections).", {}, async () => {
		const team = getTeam();
		const data = await nucleoApi("GET", `api/projectsByTeam/${team.remoteId}`);
		return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
	});

	server.tool(
		"create_project",
		"Create a new Nucleo project (collection). Syncs to both the remote API and the local database.",
		{
			title: z.string().describe("Project name"),
			primaryColor: z.string().default("000000").optional().describe("Hex color (default: 000000)"),
			secondaryColor: z.string().default("ffffff").optional().describe("Hex color"),
			backgroundColor: z.string().default("ffffff").optional().describe("Hex color"),
		},
		async ({ title, primaryColor, secondaryColor, backgroundColor }) => {
			const team = getTeam();
			const pColor = primaryColor ?? "000000";
			const sColor = secondaryColor ?? "ffffff";
			const bColor = backgroundColor ?? "ffffff";

			const remote = (await nucleoApi("POST", `api/addProject/${account.token}`, {
				title,
				team_id: team.remoteId!,
				primaryColor: pColor,
				secondaryColor: sColor,
				backgroundColor: bColor,
			})) as Record<string, unknown>;

			const projectPath = join(NC_PROJECTS_PATH, remote._id as string);
			await Bun.$`mkdir -p ${projectPath}`;

			const [inserted] = writeDb
				.insert(schema.projects)
				.values({
					title,
					teamId: team.id,
					path: projectPath,
					uuid: remote._id as string,
					order: 0,
					iconsCount: 0,
					primaryColor: pColor,
					secondaryColor: sColor,
					backgroundColor: bColor,
					local: "0",
					createdAt: sql`datetime('now')`,
					updatedAt: sql`datetime('now')`,
				})
				.returning({ id: schema.projects.id })
				.all();

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ ...remote, local_id: inserted.id }, null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"add_icons_to_project",
		"Add icons to a Nucleo project by their IDs. Syncs to both the remote API and the local database.",
		{
			project_id: z.number().describe("The local project ID to add icons to"),
			icon_ids: z.array(z.number()).describe("Array of icon IDs to add"),
		},
		async ({ project_id, icon_ids }) => {
			const team = getTeam();

			const iconData: {
				name: string | null;
				klass: string | null;
				tags: string | null;
				nucleo_tags: string | null;
				grid: number | null;
				width: number | null;
				height: number | null;
				src: string;
				project_id: number;
			}[] = [];

			for (const id of icon_ids) {
				const [row] = await db.select().from(schema.icons).where(eq(schema.icons.id, id)).limit(1);
				if (!row || !row.setId) continue;

				try {
					const src = await readFile(join(SETS_PATH, String(row.setId), `${row.id}.svg`), "utf-8");
					iconData.push({
						name: row.name,
						klass: row.klass,
						tags: row.tags,
						nucleo_tags: row.nucleoTags,
						grid: row.grid,
						width: row.width,
						height: row.height,
						src,
						project_id,
					});
				} catch {
					// skip missing SVG files
				}
			}

			if (iconData.length === 0) {
				return {
					content: [{ type: "text", text: "No valid icons found for the given IDs" }],
					isError: true,
				};
			}

			const data = await nucleoApi("POST", `api/addIcons/${account.token}`, {
				icons: JSON.stringify(iconData),
				project_id,
				team_id: team.remoteId!,
			});

			// Mirror into local DB
			const [localProject] = await db
				.select({ id: schema.projects.id, path: schema.projects.path })
				.from(schema.projects)
				.where(eq(schema.projects.id, project_id))
				.limit(1);

			if (localProject) {
				for (const icon of iconData) {
					const [inserted] = writeDb
						.insert(schema.icons)
						.values({
							name: icon.name,
							klass: icon.klass,
							tags: icon.tags,
							nucleoTags: icon.nucleo_tags,
							grid: icon.grid,
							width: icon.width,
							height: icon.height,
							src: icon.src,
							projectId: localProject.id,
							local: "0",
							createdAt: sql`datetime('now')`,
							updatedAt: sql`datetime('now')`,
						})
						.returning({ id: schema.icons.id })
						.all();

					if (localProject.path) {
						await Bun.write(join(localProject.path, `${inserted.id}.svg`), icon.src);
					}
				}

				writeDb
					.update(schema.projects)
					.set({
						iconsCount: sql`(SELECT COUNT(*) FROM icons WHERE project_id = ${localProject.id})`,
					})
					.where(eq(schema.projects.id, localProject.id))
					.run();
			}

			return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
		},
	);

	server.tool(
		"update_project",
		"Update a Nucleo project's properties (title, colors).",
		{
			project_id: z.number().describe("The project ID to update"),
			title: z.string().optional().describe("New project title"),
			primaryColor: z.string().optional().describe("Hex color"),
			secondaryColor: z.string().optional().describe("Hex color"),
			backgroundColor: z.string().optional().describe("Hex color"),
		},
		async ({ project_id, ...updates }) => {
			const team = getTeam();
			const body: Record<string, unknown> = { id: project_id, team_id: team.remoteId! };
			if (updates.title) body.title = updates.title;
			if (updates.primaryColor) body.primaryColor = updates.primaryColor;
			if (updates.secondaryColor) body.secondaryColor = updates.secondaryColor;
			if (updates.backgroundColor) body.backgroundColor = updates.backgroundColor;

			const data = await nucleoApi("POST", `api/updateProject/${account.token}`, body);
			return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
		},
	);
}
