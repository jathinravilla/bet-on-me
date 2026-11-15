// Safe staging backend: throwaway in-memory database, but the REAL Solana devnet and Gemini.
// Lets us test the full money flow (including the on-chain memo) without touching the live database.
//   npx tsx --env-file=.env.local scripts/dev-staging.ts
import { createServer } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri(); // overrides the live database from .env.local
  process.env.SOLANA_MOCK = "false";
  process.env.DEMO_MODE = "true";
  process.env.SIGNUP_FUNDING_SOL = "0.2";
  delete process.env.VERCEL;
  const { handle } = await import("../server/app.js");
  const port = Number(process.env.PORT || 3100);
  createServer((req, res) => void handle(req, res)).listen(port, "127.0.0.1", () => console.log(`Staging API (throwaway DB, real devnet + Gemini) on http://127.0.0.1:${port}/api`));
}
void main();
