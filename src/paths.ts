import { homedir } from "os";
import { join } from "path";

export const HOME = homedir();
export const NUCLEO_BASE = join(HOME, "Library", "Application Support", "Nucleo");
export const ICONS_BASE = join(NUCLEO_BASE, "icons");
export const SETS_PATH = join(ICONS_BASE, "sets");
export const NC_PROJECTS_PATH = join(ICONS_BASE, "nc-projects");
export const ACCOUNT_DATA_PATH = join(NUCLEO_BASE, "storage", "accountData.json");
