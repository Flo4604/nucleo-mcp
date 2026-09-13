import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { Caller } from "../auth";
import { db, schema } from "../db";
import { teamSync } from "../nucleo/api";
import { DEFAULT_COLOR, renderSvg } from "../svg";

const HEX = /^#?[0-9a-fA-F]{6}$/;

function normaliseColor(value: string | undefined, fallback: string): string {
	if (!value) return fallback;
	if (!HEX.test(value)) throw new Error(`Expected a six-digit hex colour, got "${value}"`);
	return value.replace("#", "");
}

function json(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * Projects live on the caller's Nucleo account, so every call here uses the
 * caller's own token rather than the token the server syncs the library with.
 */
export function registerProjectTools(server: McpServer, caller: Caller): void {
	const resolveTeam = (requested?: string): string => {
		if (requested) return requested;
		const team = caller.teams[0];
		if (!team) throw new Error("This Nucleo account has no team; projects require a Pro or Team plan");
		return String(team.id);
	};

	server.registerTool("list_projects", {
		title: "List projects",
		description: "List the Nucleo projects (collections) on the caller's team.",
		inputSchema: {
			team_id: z.string().optional().describe("Team ID; defaults to the caller's first team"),
		},
	}, async ({ team_id }) => json(await teamSync("GET", `api/projectsByTeam/${resolveTeam(team_id)}`)));

	server.registerTool(
		"create_project",
		{
			title: "Create a project",
			description: "Create a new Nucleo project (collection) on the caller's team.",
			inputSchema: {
				title: z.string().min(1).describe("Project name"),
				primaryColor: z.string().optional().describe("Hex colour, default 000000"),
				secondaryColor: z.string().optional().describe("Hex colour, default ffffff"),
				backgroundColor: z.string().optional().describe("Hex colour, default ffffff"),
				team_id: z.string().optional(),
			},
		},
		async ({ title, primaryColor, secondaryColor, backgroundColor, team_id }) =>
			json(
				await teamSync("POST", `api/addProject/${caller.token}`, {
					title,
					team_id: resolveTeam(team_id),
					primaryColor: normaliseColor(primaryColor, "000000"),
					secondaryColor: normaliseColor(secondaryColor, "ffffff"),
					backgroundColor: normaliseColor(backgroundColor, "ffffff"),
				}),
			),
	);

	server.registerTool("add_icons_to_project", {
		title: "Add icons to a project",
		description: "Add icons to a Nucleo project by their IDs.",
		inputSchema: {
			project_id: z.number().int().describe("The project ID to add icons to"),
			icon_ids: z.array(z.number().int()).min(1).describe("Icon IDs to add"),
			team_id: z.string().optional(),
		},
	}, async ({ project_id, icon_ids, team_id }) => {
		// Fetch every requested icon in one query, then build the payload.
		const rows = db
			.select()
			.from(schema.icons)
			.where(inArray(schema.icons.id, icon_ids))
			.all();

		if (rows.length === 0) {
			return {
				content: [{ type: "text" as const, text: "No icons matched the given IDs" }],
				isError: true,
			};
		}

		const payload = rows.map((icon) => ({
			name: icon.name,
			klass: icon.fill,
			tags: (JSON.parse(icon.tags) as string[]).join(","),
			nucleo_tags: null,
			grid: icon.size,
			width: icon.size,
			height: icon.size,
			src: renderSvg(icon.svg, icon.size, DEFAULT_COLOR),
			project_id,
		}));

		const result = await teamSync("POST", `api/addIcons/${caller.token}`, {
			icons: JSON.stringify(payload),
			project_id,
			team_id: resolveTeam(team_id),
		});

		const missing = icon_ids.filter((id) => !rows.some((row) => row.id === id));
		return json({ added: payload.length, missing, result });
	});

	server.registerTool("update_project", {
		title: "Update a project",
		description: "Update a Nucleo project's title or colours.",
		inputSchema: {
			project_id: z.number().int().describe("The project ID to update"),
			title: z.string().optional(),
			primaryColor: z.string().optional(),
			secondaryColor: z.string().optional(),
			backgroundColor: z.string().optional(),
			team_id: z.string().optional(),
		},
	}, async ({ project_id, title, primaryColor, secondaryColor, backgroundColor, team_id }) => {
		const body: Record<string, unknown> = {
			id: project_id,
			team_id: resolveTeam(team_id),
		};
		if (title) body.title = title;
		if (primaryColor) body.primaryColor = normaliseColor(primaryColor, "000000");
		if (secondaryColor) body.secondaryColor = normaliseColor(secondaryColor, "ffffff");
		if (backgroundColor) body.backgroundColor = normaliseColor(backgroundColor, "ffffff");

		return json(await teamSync("POST", `api/updateProject/${caller.token}`, body));
	});
}
