// Local dev server: `npm run dev` serves the same handler Vercel runs, on http://localhost:3000/api/*
import { createServer } from "node:http";
import { handle } from "./app";

const port = Number(process.env.PORT || 3000);
createServer((req, res) => void handle(req, res)).listen(port, "0.0.0.0", () => {
  console.log(`Bet On Me API on http://localhost:${port}/api  (demo=${process.env.DEMO_MODE}, mockChain=${process.env.SOLANA_MOCK})`);
});
