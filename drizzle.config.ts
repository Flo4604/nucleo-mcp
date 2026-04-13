import { defineConfig } from "drizzle-kit";
import { homedir } from "os";
import { join } from "path";

export default defineConfig({
  dialect: "sqlite",
  out: "./src/db",
  dbCredentials: {
    url: join(
      homedir(),
      "Library",
      "Application Support",
      "Nucleo",
      "icons",
      "data.sqlite3",
    ),
  },
});
