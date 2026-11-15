// Zero-setup local backend: in-memory database + fake chain, so the app can be tried with no keys at all.
// Nothing here is used in production. Data resets every time you restart it.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.WALLET_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
  process.env.SOLANA_MOCK = "true";
  process.env.DEMO_MODE = "true";
  const { handle } = await import("../server/app.js");
  const port = Number(process.env.PORT || 3000);
  createServer((req, res) => {
    // Local-only: let the Expo web preview (another localhost port) call this server.
    const origin = req.headers.origin ?? "";
    if (/^http:\/\/localhost:\d+$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    void handle(req, res);
  }).listen(port, "0.0.0.0", () => console.log(`Local Bet On Me API (in-memory, fake chain) on http://localhost:${port}/api`));
}
void main();
