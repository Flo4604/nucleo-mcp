import { createDecipheriv, createHash } from "crypto";
import { readFileSync } from "fs";
import { ACCOUNT_DATA_PATH } from "./paths";

// Nucleo encrypts accountData.json with AES-256-CTR using a static seed
// that is the same across all installations. The key is derived by hashing
// the seed with SHA-256, base64-encoding, and taking the first 32 characters.
// The IV is stored as hex before the colon, the ciphertext after it.
const ENCRYPTION_SEED = "5939370688";

export function decryptAccountData(): {
	id: string;
	token: string;
	email: string;
} {
	const raw = JSON.parse(readFileSync(ACCOUNT_DATA_PATH, "utf8"));
	const [ivHex, ciphertext] = raw.encrypted.split(":");
	const iv = Buffer.from(ivHex, "hex");
	const key = createHash("sha256").update(ENCRYPTION_SEED).digest("base64").substring(0, 32);
	const decipher = createDecipheriv("aes-256-ctr", key, iv);
	const decrypted = decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8");
	return JSON.parse(decrypted);
}
