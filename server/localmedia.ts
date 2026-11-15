// Local-only stand-in for Vercel Blob, so dare proof videos work on a laptop with no storage keys.
// Never active on Vercel, and only when BLOB_READ_WRITE_TOKEN is missing.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ObjectId } from "mongodb";
import { safeEqual, sha256 } from "./crypto";
import { cols } from "./db";
import { HttpError, type Ctx } from "./http";

export const LOCAL_MEDIA = () => !process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL;

const DIR = join(tmpdir(), "betonme-local-uploads");
const MAX_BYTES = 18 * 1024 * 1024;
const FILE = /^([a-f0-9]{24})\.(mov|mp4)$/;

/** Base URL the phone or browser used to reach this server (e.g. http://10.0.0.5:3000). */
export function originOf(ctx: Ctx): string {
  const host = ctx.req.headers.host ?? "localhost:3000";
  if (!/^[a-zA-Z0-9.\-:\[\]]+$/.test(host)) throw new HttpError(400, "Bad host.");
  return `http://${host}`;
}

export const localVideoPath = (proofId: string, ext: string) => `/api/dare/local-video/${proofId}.${ext}`;

/** PUT /dare/local-upload/:proofId?k=<one-time key> with the raw video bytes. */
export async function localUpload(ctx: Ctx) {
  if (!LOCAL_MEDIA()) throw new HttpError(404, "Not found.");
  const id = ctx.params.proofId;
  if (!/^[a-f0-9]{24}$/.test(id)) throw new HttpError(400, "Invalid proof.");
  const { proofs } = await cols();
  const proof = await proofs.findOne({ _id: new ObjectId(id) });
  const key = ctx.query.get("k") ?? "";
  if (!proof?.localUploadKey || !key || !safeEqual(sha256(key), proof.localUploadKey) || !proof.uploadPath) throw new HttpError(403, "Upload link is invalid or expired.");
  const ext = proof.uploadPath.endsWith(".mov") ? "mov" : "mp4";

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of ctx.req) {
    size += (c as Buffer).length;
    if (size > MAX_BYTES) throw new HttpError(413, "That video is too large. Keep it under 15 seconds.");
    chunks.push(c as Buffer);
  }
  if (size === 0) throw new HttpError(400, "The upload was empty.");
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${id}.${ext}`), Buffer.concat(chunks));
  await proofs.updateOne({ _id: proof._id }, { $unset: { localUploadKey: "" } }); // one upload per key
  return { url: `${originOf(ctx)}${localVideoPath(id, ext)}` };
}

/** Reads a locally stored proof video, only by its exact `<proofId>.<ext>` name. */
export async function readLocalVideo(proofId: string, ext: string): Promise<Buffer> {
  if (!/^[a-f0-9]{24}$/.test(proofId) || (ext !== "mov" && ext !== "mp4")) throw new HttpError(400, "Invalid video.");
  try {
    return await readFile(join(DIR, `${proofId}.${ext}`));
  } catch {
    throw new HttpError(404, "Video not found. Try recording again.");
  }
}

/** GET /dare/local-video/:file — lets players watch proofs on the local server. */
export async function serveLocalVideo(ctx: Ctx) {
  if (!LOCAL_MEDIA()) throw new HttpError(404, "Not found.");
  const m = FILE.exec(ctx.params.file ?? "");
  if (!m) throw new HttpError(404, "Not found.");
  const data = await readLocalVideo(m[1], m[2]);
  ctx.res.statusCode = 200;
  ctx.res.setHeader("Content-Type", m[2] === "mov" ? "video/quicktime" : "video/mp4");
  ctx.res.setHeader("Content-Length", String(data.length));
  ctx.res.end(data);
  return { __handled: true };
}
