/**
 * Local development entry point for macOS: takes the sync credentials from this
 * machine's Nucleo installation so you do not have to put them in your shell.
 * Production runs src/index.ts with NUCLEO_USER_ID and NUCLEO_TOKEN set.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const raw = JSON.parse(
	readFileSync(
		join(homedir(), "Library", "Application Support", "Nucleo", "storage", "accountData.json"),
		"utf8",
	),
) as { encrypted: string };

const [ivHex, ciphertext] = raw.encrypted.split(":");
const key = createHash("sha256").update("5939370688").digest("base64").substring(0, 32);
const decipher = createDecipheriv("aes-256-ctr", key, Buffer.from(ivHex!, "hex"));
const account = JSON.parse(
	decipher.update(ciphertext!, "hex", "utf8") + decipher.final("utf8"),
) as { id: string; token: string };

process.env.NUCLEO_USER_ID ??= account.id;
process.env.NUCLEO_TOKEN ??= account.token;
process.env.DATA_DIR ??= ".data";
process.env.PORT ??= "8080";

await import("../src/index");
