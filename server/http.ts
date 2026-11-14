import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserDoc } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
  params: Record<string, string>;
  ip: string;
  user: UserDoc; // set for authenticated routes
}

export type Handler = (ctx: Ctx) => Promise<unknown>;

export interface Route {
  method: "GET" | "POST";
  pattern: string; // e.g. /challenges/:id/sync
  auth: boolean;
  handler: Handler;
}

export function matchRoute(routes: Route[], method: string, path: string) {
  const segs = path.split("/").filter(Boolean);
  let pathMatched = false;
  for (const r of routes) {
    const pat = r.pattern.split("/").filter(Boolean);
    if (pat.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      if (pat[i].startsWith(":")) params[pat[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (pat[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    pathMatched = true;
    if (r.method === method) return { route: r, params };
  }
  return pathMatched ? "method" : null;
}

const MAX_BODY = 64 * 1024;

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method !== "POST") return {};
  let raw: unknown = (req as { body?: unknown }).body; // present on Vercel
  if (raw === undefined) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_BODY) throw new HttpError(413, "Request too large.");
      chunks.push(c as Buffer);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  if (typeof raw === "string") {
    if (!raw.trim()) return {};
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Body must be JSON.");
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

// ---- tiny input validators (reject anything that isn't the plain type we expect) ----

export function str(v: unknown, name: string, min: number, max: number): string {
  if (typeof v !== "string") throw new HttpError(400, `${name} is required.`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${name} must be ${min}-${max} characters.`);
  return s;
}

export function optStr(v: unknown, name: string, max: number): string {
  if (v === undefined || v === null || v === "") return "";
  return str(v, name, 0, max);
}

export function num(v: unknown, name: string, min: number, max: number, integer = false): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new HttpError(400, `${name} must be a number.`);
  if (integer && !Number.isInteger(v)) throw new HttpError(400, `${name} must be a whole number.`);
  if (v < min || v > max) throw new HttpError(400, `${name} must be between ${min} and ${max}.`);
  return v;
}

export function oneOf<T extends string>(v: unknown, name: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new HttpError(400, `${name} must be one of: ${allowed.join(", ")}.`);
  return v as T;
}

export function objectIdStr(v: unknown, name: string): string {
  if (typeof v !== "string" || !/^[a-f0-9]{24}$/.test(v)) throw new HttpError(400, `${name} is invalid.`);
  return v;
}
