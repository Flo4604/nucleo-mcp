import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sql } from "drizzle-orm";
import { authenticate, AuthError, type Caller } from "./auth";
import { config } from "./config";
import { db, schema } from "./db";
import { groupStatuses } from "./sync";
import { registerIconTools } from "./tools/icons";
import { registerProjectTools } from "./tools/projects";
import { registerSetTools } from "./tools/sets";

/**
 * A fresh server per request. It keeps the deployment stateless, and it lets the
 * project tools close over the authenticated caller's own Nucleo token.
 */
function buildServer(caller: Caller): McpServer {
	const server = new McpServer(
		{ name: "nucleo", version: "2.0.0" },
		{ capabilities: { tools: {} } },
	);
	registerSetTools(server);
	registerIconTools(server);
	registerProjectTools(server, caller);
	return server;
}

async function handleMcp(req: Request): Promise<Response> {
	let caller: Caller;
	try {
		caller = await authenticate(req.headers.get("authorization"));
	} catch (err) {
		const status = err instanceof AuthError ? err.status : 401;
		return Response.json({
			jsonrpc: "2.0",
			error: { code: -32001, message: (err as Error).message },
			id: null,
		}, {
			status,
			headers: { "WWW-Authenticate": "Bearer realm=\"nucleo-mcp\"" },
		});
	}

	const server = buildServer(caller);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});

	await server.connect(transport);
	try {
		return await transport.handleRequest(req);
	} finally {
		// Stateless mode: nothing survives the response.
		await transport.close().catch(() => {});
		await server.close().catch(() => {});
	}
}

function health(): Response {
	const total = db.select({ n: sql<number>`count(*)` }).from(schema.icons).get()?.n ?? 0;
	const groups = groupStatuses();
	const ready = total > 0;

	return Response.json({
		status: ready ? "ok" : "seeding",
		icons: total,
		groups: groups.map((g) => ({
			key: g.key,
			icons: g.iconCount,
			syncedAt: g.syncedAt ? new Date(g.syncedAt).toISOString() : null,
		})),
	}, { status: ready ? 200 : 503 });
}

export function serve(): void {
	Bun.serve({
		port: config.port,
		idleTimeout: 120,
		async fetch(req) {
			const { pathname } = new URL(req.url);

			if (pathname === "/health" || pathname === "/") return health();
			if (pathname === "/mcp") return handleMcp(req);

			return new Response("Not found", { status: 404 });
		},
	});

	console.log(`nucleo-mcp listening on :${config.port} (POST /mcp)`);
}
