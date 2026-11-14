// Generates the secrets we can make ourselves and writes them to .env.local (never committed):
//   TREASURY_SECRET_KEY, WALLET_ENCRYPTION_KEY, CRON_SECRET
// Existing values are kept. Only the treasury's PUBLIC address is printed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const file = ".env.local";
const template = existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
let text = existsSync(file) ? readFileSync(file, "utf8") : template;

const get = (k: string) => text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
function set(k: string, v: string) {
  if (new RegExp(`^${k}=`, "m").test(text)) text = text.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
  else text += `${text.endsWith("\n") || text === "" ? "" : "\n"}${k}=${v}\n`;
}

if (!get("TREASURY_SECRET_KEY")) set("TREASURY_SECRET_KEY", bs58.encode(Keypair.generate().secretKey));
if (!get("WALLET_ENCRYPTION_KEY")) set("WALLET_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
if (!get("CRON_SECRET")) set("CRON_SECRET", randomBytes(32).toString("hex"));
writeFileSync(file, text, { mode: 0o600 });

const treasury = Keypair.fromSecretKey(bs58.decode(get("TREASURY_SECRET_KEY")));
console.log(`Secrets saved to ${file} (not committed to git).`);
console.log(`\nTreasury wallet address (fund this at https://faucet.solana.com, network = devnet):\n\n  ${treasury.publicKey.toBase58()}\n`);
