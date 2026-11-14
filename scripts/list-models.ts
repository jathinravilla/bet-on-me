// Gemini diagnostics: which Flash models respond right now, and how fast.
//   npx tsx --env-file=.env.local scripts/list-models.ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  for (const model of ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]) {
    const t = Date.now();
    try {
      const r = await ai.models.generateContent({
        model,
        contents: "Reply with the single word: ok",
        config: { httpOptions: { timeout: 15000 }, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
      console.log(model, "OK", Date.now() - t, "ms", JSON.stringify(r.text?.slice(0, 20)));
    } catch (e) {
      console.log(model, "FAIL", Date.now() - t, "ms", (e as Error).message.slice(0, 140));
    }
  }
}
main();
