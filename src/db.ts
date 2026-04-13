import { drizzle } from "drizzle-orm/bun-sqlite";
import { join } from "path";
import * as schema from "./db/schema";
import { ICONS_BASE } from "./paths";

const DB_PATH = join(ICONS_BASE, "data.sqlite3");

export const db = drizzle({ connection: { source: DB_PATH, readonly: true }, schema });
export const writeDb = drizzle({ connection: { source: DB_PATH }, schema });

export { schema };
