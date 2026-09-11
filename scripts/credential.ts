/**
 * Prints the bearer credential for this machine's Nucleo installation.
 *
 * Nucleo encrypts accountData.json with AES-256-CTR under a seed that ships in
 * the desktop app, so this reads your own local credentials -- it does not
 * bypass anything. macOS paths; adjust for other platforms.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_DATA = join(
	homedir(),
	"Library",
	"Application Support",
	"Nucleo",
	"storage",
	"accountData.json",
);
const ENCRYPTION_SEED = "5939370688";

function decrypt(): { id: string; token: string; email: string } {
	const raw = JSON.parse(readFileSync(ACCOUNT_DATA, "utf8")) as { encrypted: string };
	const [ivHex, ciphertext] = raw.encrypted.split(":");
	if (!ivHex || !ciphertext) throw new Error("accountData.json is not in the expected format");

	const key = createHash("sha256").update(ENCRYPTION_SEED).digest("base64").substring(0, 32);
	const decipher = createDecipheriv("aes-256-ctr", key, Buffer.from(ivHex, "hex"));
	return JSON.parse(decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8"));
}

const account = decrypt();
const mode = process.argv[2];

if (mode === "--env") {
	// Server-side sync credentials.
	console.log(`NUCLEO_USER_ID=${account.id}`);
	console.log(`NUCLEO_TOKEN=${account.token}`);
} else {
	// Client-side bearer credential.
	console.error(`# Nucleo account: ${account.email}`);
	console.log(`${account.id}:${account.token}`);
}
