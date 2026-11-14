// chess.com (public API) and Strava (OAuth) integrations.
import type { ChessTimeControl } from "../lib/types";
import { decrypt, encrypt } from "./crypto";
import { cols, type UserDoc } from "./db";
import { need } from "./env";
import { HttpError } from "./http";

const UA = "BetOnMe/1.0 (sunhacks 2026 hackathon project)";

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{ status: number; json: any }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

// ---------- chess.com ----------

export const CHESS_USERNAME = /^[a-zA-Z0-9_-]{3,25}$/;

export async function chessPlayerExists(username: string): Promise<boolean> {
  const { status } = await fetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`, {
    headers: { "User-Agent": UA },
  });
  if (status === 200) return true;
  if (status === 404) return false;
  throw new HttpError(502, "chess.com didn't respond. Try again in a moment.");
}

/** Current rating for a time control, or null if the player has no rating there / the API failed. */
export async function chessRating(username: string, tc: ChessTimeControl): Promise<number | null> {
  try {
    const { status, json } = await fetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`, {
      headers: { "User-Agent": UA },
    });
    if (status !== 200) return null;
    const rating = json?.[`chess_${tc}`]?.last?.rating;
    return typeof rating === "number" ? rating : null;
  } catch {
    return null;
  }
}

// ---------- Strava ----------

const METERS_PER_MILE = 1609.344;
const stravaTypes = () => (process.env.STRAVA_TYPES || "Run,TrailRun,VirtualRun,Walk,Hike").split(",").map((s) => s.trim());

export function stravaAuthorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: need("STRAVA_CLIENT_ID"),
    redirect_uri: need("STRAVA_REDIRECT_URI"),
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/mobile/authorize?${q}`;
}

async function stravaToken(params: Record<string, string>) {
  const { status, json } = await fetchJson("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: need("STRAVA_CLIENT_ID"), client_secret: need("STRAVA_CLIENT_SECRET"), ...params }),
  });
  if (status !== 200 || typeof json?.access_token !== "string") throw new HttpError(502, "Strava rejected the connection. Try connecting again.");
  return json as { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number } };
}

export async function stravaExchange(code: string): Promise<NonNullable<UserDoc["strava"]>> {
  const t = await stravaToken({ code, grant_type: "authorization_code" });
  return { athleteId: t.athlete?.id ?? 0, accessToken: encrypt(t.access_token), refreshToken: encrypt(t.refresh_token), expiresAt: t.expires_at };
}

async function freshAccessToken(user: UserDoc): Promise<string> {
  const s = user.strava!;
  if (s.expiresAt > Date.now() / 1000 + 60) return decrypt(s.accessToken).toString("utf8");
  const t = await stravaToken({ grant_type: "refresh_token", refresh_token: decrypt(s.refreshToken).toString("utf8") });
  const { users } = await cols();
  await users.updateOne(
    { _id: user._id },
    { $set: { "strava.accessToken": encrypt(t.access_token), "strava.refreshToken": encrypt(t.refresh_token), "strava.expiresAt": t.expires_at } }
  );
  return t.access_token;
}

/** Total GPS-recorded run/walk miles in the window. Manual (typed-in) activities never count. Null on failure. */
export async function stravaMiles(user: UserDoc, after: Date, before: Date): Promise<number | null> {
  if (!user.strava) return null;
  try {
    const token = await freshAccessToken(user);
    const q = new URLSearchParams({
      after: String(Math.floor(after.getTime() / 1000)),
      before: String(Math.floor(before.getTime() / 1000)),
      per_page: "200",
    });
    const { status, json } = await fetchJson(`https://www.strava.com/api/v3/athlete/activities?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (status !== 200 || !Array.isArray(json)) return null;
    const types = stravaTypes();
    let meters = 0;
    for (const a of json) {
      if (a?.manual === true) continue;
      if (!types.includes(a?.sport_type) && !types.includes(a?.type)) continue;
      if (typeof a?.distance === "number") meters += a.distance;
    }
    return Math.round((meters / METERS_PER_MILE) * 100) / 100;
  } catch (e) {
    console.error("strava sync failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
