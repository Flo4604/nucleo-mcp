import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerIconTools } from "./tools/icons";
import { registerProjectTools } from "./tools/projects";
import { registerSetTools } from "./tools/sets";

const server = new McpServer({ name: "nucleo", version: "1.0.0" });

registerSetTools(server);
registerIconTools(server);
registerProjectTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
