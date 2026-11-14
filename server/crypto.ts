import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { need } from "./env";

function key(): Buffer {
  const raw = need("WALLET_ENCRYPTION_KEY").trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("WALLET_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).");
  return buf;
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plain: Uint8Array | string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(typeof plain === "string" ? Buffer.from(plain, "utf8") : Buffer.from(plain)), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decrypt(enc: string): Buffer {
  const [iv, tag, ct] = enc.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(sha256(a));
  const y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
export function inviteCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

const WORDS = [
  "pineapple", "butter", "waffle", "penguin", "tornado", "pickle", "volcano", "noodle", "cactus", "banjo",
  "muffin", "walrus", "pretzel", "kazoo", "avocado", "burrito", "dolphin", "giraffe", "lantern", "marble",
  "nugget", "octopus", "pancake", "raccoon", "saxophone", "tambourine", "unicorn", "yogurt", "zucchini", "bubble",
  "coconut", "dumpling", "flamingo", "gargoyle", "hammock", "jellybean", "kangaroo", "lobster", "mango", "popcorn",
];
export const livenessWord = () => WORDS[randomInt(WORDS.length)];
