import { HttpError } from "./http";

/** Read a required env var; a missing one becomes a clear 503 instead of a crash. */
export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new HttpError(503, `Server is not configured yet: ${name} is missing.`);
  return v;
}

export const DEMO_MODE = () => process.env.DEMO_MODE === "true";
// The fake chain is for local testing only — it can never be switched on in a Vercel deployment.
export const SOLANA_MOCK = () => process.env.SOLANA_MOCK === "true" && !process.env.VERCEL;
export const RPC_URL = () => process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const MAX_USERS = () => Number(process.env.MAX_USERS || 150);
