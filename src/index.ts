import { startAuthCacheSweeper } from "./auth";
import { serve } from "./http";
import { startSyncLoop } from "./sync";

// The library mirror refreshes in the background; the server starts serving
// immediately and reports "seeding" on /health until the first sync lands.
startSyncLoop();
startAuthCacheSweeper();
serve();
