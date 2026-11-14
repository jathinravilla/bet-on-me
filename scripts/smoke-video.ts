// Checks the video-judging path end to end with a local clip:
//   npx tsx --env-file=.env.local scripts/smoke-video.ts <file.mp4> "<dare>" <word>
import { readFileSync } from "node:fs";
import { judgeDareVideo } from "../server/gemini";

const [file, dareText, word] = process.argv.slice(2);
const t = Date.now();
judgeDareVideo({ video: readFileSync(file), mimeType: file.endsWith(".mov") ? "video/quicktime" : "video/mp4", dareText, word })
  .then((r) => console.log("VERDICT:", JSON.stringify(r), `${Date.now() - t}ms`))
  .catch((e) => console.log("FAILED:", e.message));
