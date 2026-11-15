// The single request handler behind every /api/* URL (one Vercel function keeps us under the Hobby limit).
import type { IncomingMessage, ServerResponse } from "node:http";
import { sha256 } from "./crypto";
import { cols } from "./db";
import { HttpError, matchRoute, readJson, sendJson, type Ctx } from "./http";
import { routes } from "./routes";

function clientIp(req: IncomingMessage): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real) return real;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  // The web version of the app lives on a different address, so browsers need these headers. Login is a
  // Bearer token (no cookies), so allowing any origin does not let another site act as a logged-in user.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if ((req.method ?? "").toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    return void res.end();
  }
  try {
    const url = new URL(req.url ?? "/", "http://local");
    const rewritten = url.searchParams.get("__p");
    const path = rewritten !== null ? `/${rewritten}` : url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    url.searchParams.delete("__p");
    const method = (req.method ?? "GET").toUpperCase();

    const m = matchRoute(routes, method, path);
    if (m === null) throw new HttpError(404, "Not found.");
    if (m === "method") throw new HttpError(405, "Method not allowed.");

    const ctx = { req, res, method, path, query: url.searchParams, params: m.params, ip: clientIp(req), body: {} } as Ctx;
    if (m.route.auth) {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (token.length < 20) throw new HttpError(401, "Please log in again.");
      const { users } = await cols();
      const user = await users.findOne({ sessions: sha256(token) });
      if (!user) throw new HttpError(401, "Please log in again.");
      ctx.user = user;
    }
    ctx.body = await readJson(req);

    const out = (await m.route.handler(ctx)) as { __redirect?: string; __html?: string; __handled?: boolean } | undefined;
    if (out?.__handled) return; // the handler already wrote the response (e.g. a video file)
    if (out && typeof out.__redirect === "string") {
      res.statusCode = 302;
      res.setHeader("Location", out.__redirect);
      res.setHeader("Cache-Control", "no-store");
      res.end();
    } else if (out && typeof out.__html === "string") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(out.__html);
    } else sendJson(res, 200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message });
    console.error("unhandled:", e); // details stay in the server logs, never in the response
    sendJson(res, 500, { error: "Something went wrong on our side. Try again." });
  }
}
