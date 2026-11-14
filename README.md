# Bet On Me

**Put money on your own goals.** Friends (or strangers) stake SOL into a pot on a goal — run 20 miles this week, hit 1200 on chess.com, do a dare — the app checks the proof automatically and pays the winners on **Solana devnet** (test money only).

Built at sunhacks 2026 by team Moneyball. Mascot: **Butterfingers**, a nervous stick of butter who keeps almost dropping a coin.

## How it works

| Category | Proof |
|---|---|
| Running | Strava API — GPS-recorded runs/walks only; manual activities are ignored |
| Chess | chess.com public API — live rating (rapid / blitz / bullet) |
| Dare | In-app 15s video with a random liveness word, judged by Gemini, then disputed/voted by players |

- Every user gets a custodial devnet wallet funded from a treasury on sign-up.
- Each challenge has its own escrow wallet. Joining moves your stake into it; settlement pays winners from it. Every transfer links to Solana Explorer.
- **Target** challenges: everyone hits it → stakes returned; some hit it → they split the pot; nobody → leader takes it (dares refund).
- **Open** challenges: most progress takes the pot; ties split; no progress → refund.
- **Clout** points (+10 join, +50 complete, +100 win, −20 fail) unlock higher stakes and more public dares.
- Dares are screened by Gemini against community guidelines; public challenges can be voted on and are removed + refunded after 3 reports.

## Tech

Expo (SDK 58, expo-router, Reanimated, react-native-svg) · Node/TypeScript on Vercel serverless · MongoDB Atlas · Vercel Blob · Gemini (`@google/genai`) · `@solana/web3.js` on devnet.

```
/app      Expo app (screens in app/src/app)
/api      Vercel entry point (one function serves every /api/* route)
/server   Backend logic: routes, settlement, Solana, Gemini, Strava, chess.com
/lib      Shared types + pure payout/points rules (unit tested)
/scripts  Key generation, local no-keys dev server
```

## Run it

**Try it with no keys at all** (in-memory database + simulated chain):

```bash
npm install && npm run dev:local
```
```bash
cd app && npm install && npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `app/.env` to your computer's LAN address (e.g. `http://192.168.1.20:3000`) to use a phone, then scan the QR code with Expo Go.

**Real setup**

1. `npm run keys` — generates the treasury wallet, wallet-encryption key and cron secret into `.env.local`, and prints the treasury address.
2. Fund the treasury address at <https://faucet.solana.com> (devnet). `npm run treasury` shows its balance.
3. Fill the rest of `.env.local` (see `.env.example`): `MONGODB_URI`, `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `STRAVA_CLIENT_ID/SECRET/REDIRECT_URI`.
4. `npm run dev` for a local backend against the real services, or deploy to Vercel and add the same variables there.
5. Point the app at it: `EXPO_PUBLIC_API_URL=https://<your-vercel-domain>` in `app/.env`.

`npm test` runs the payout-rule unit tests and an end-to-end API test.

## Demo (3 minutes)

1. **Hook** — Butterfingers on the login screen; log in with a username.
2. **Create + join** — create a friends chess challenge (0.1 SOL); teammate joins with the invite code; open the escrow on Solana Explorer.
3. **Dare** — open a public dare → Record proof → say the word → Gemini verdict.
4. **Payout** — Demo tools → **End now**: leaderboard finalises, Butterfingers celebrates/fumbles, payout transaction on Explorer.
5. **Wrap** — Strava sync on the profile, Clout unlocks, devnet only.

`DEMO_MODE=true` adds a 5-minute duration, a 10-second dispute window, "End now" and "Simulate progress".

## Honest limits (it's a hackathon MVP)

- Devnet only — no real money. Wallets are custodial (keys encrypted with AES-256-GCM on the server).
- Login is a username with no password, by design for the demo: anyone who knows a username can log in as it.
- Settlement runs when a challenge is opened after its end time, plus a daily cron (Vercel Hobby limit).
