# Bet On Me

**Put money on your own goals.** Friends (or strangers) stake test coins into a pot on a goal — run 20 miles this week, hit 1200 on chess.com, make 25 GitHub contributions, earn 1,000 Duolingo XP, do a dare — the app checks the proof automatically and pays the winners on **Solana devnet** (test money only).

Built at sunhacks 2026 by team Moneyball. Mascot: **Butterfingers**, a nervous stick of butter who keeps almost dropping a coin.

## How it works

| Category | Proof |
|---|---|
| Running | Strava API — GPS-recorded runs/walks only; manual activities are ignored |
| Chess | chess.com public API — live rating (rapid / blitz / bullet) |
| GitHub | Public contribution calendar (commits, PRs, issues, reviews) — only contributions made after you join count |
| Duolingo | XP from the public profile — only XP earned after you join counts |
| Dare | In-app 15s video with a random liveness word, judged by Gemini, then disputed/voted by players |

Running uses a simulated Strava in demo mode (no Strava API app yet). GitHub and Duolingo need no sign-in, but the username isn't ownership-checked. A failed read from any of these sources refuses the create/join instead of counting someone's whole history as progress.

- Every user gets a custodial devnet wallet funded from a treasury on sign-up.
- Each challenge has its own escrow wallet. Joining moves your stake into it; settlement pays winners from it. Every transfer links to Solana Explorer.
- **Target** challenges: everyone hits it → stakes returned; some hit it → they split the pot; nobody → leader takes it (dares refund).
- **Open** challenges: most progress takes the pot; ties split; no progress → refund.
- **Clout** points (+10 join, +50 complete, +100 win, −20 fail) unlock higher stakes and more public dares.
- **On-chain receipts (Solana):** every settlement writes a fingerprint of the result into the payout transaction with the Memo program (`betonme:v1:<challenge>:<outcome>:<hash>`), so the winner list can't be quietly changed. The challenge screen links to it on Explorer.
- **Coach Butterfingers (Gemini + Supermemory):** on the stake step, Gemini rates how doable the goal is (odds, verdict, tip). The stake suggestion is computed in code from the odds and the player's limits, never by the model. The coach also **remembers your past bets**: finished bets are saved to [Supermemory](https://supermemory.ai) (one plain sentence per player, filed under the player id, no names), recalled before the coach answers, and shown as e.g. "I remember you missed your last running bet." If Supermemory is off or slow, the coach falls back to your past bets in MongoDB. After a bet settles, Gemini also writes a one-line winner/loser comment for the share card.
- **Search (MongoDB Atlas Search):** the Public tab searches public bets with typo tolerance, and public challenges show "Bets like this" using Atlas Search `moreLikeThis`. The index is created automatically; a plain text match covers the first minute while it builds.
- **Discussion threads:** every bet has a thread with comments, replies, mentions, nudges and backing, plus automatic updates (joins, progress, results). Links, phone numbers and emails are filtered; comments hidden after 3 reports.
- **Home feed:** *Current / Finished / Closed* tabs, a category filter, and a ⋯ menu to hide a bet from your own home. Hiding only changes your own list; stakes, pots and results are untouched, and "Show hidden bets" brings them back.
- **Share cards:** settled bets render a picture card (mascot, winner, pot, receipt) that shares as an image on phones. Invite links open the join screen with the code filled in, on the web version.
- Dares are screened by Gemini against community guidelines; public challenges can be voted on and are removed + refunded after 3 reports.

## Tech

Expo (SDK 58, expo-router, Reanimated, react-native-svg) · Node/TypeScript on Vercel serverless · MongoDB Atlas (+ Atlas Search) · Vercel Blob · Gemini (`@google/genai`) · Supermemory · `@solana/web3.js` on devnet (+ Memo program) · EAS Update.

Anyone can try it without installing anything: **https://bet-on-me-web.vercel.app** (the same app, built for the web).

```
/app      Expo app (screens in app/src/app)
/api      Vercel entry point (one function serves every /api/* route)
/server   Backend logic: routes, settlement, Solana, Gemini, Supermemory memory, Strava, chess.com, GitHub, Duolingo
/lib      Shared types + pure payout/points rules (unit tested)
/scripts  Key generation, local dev server, staging server (real devnet + Gemini, throwaway DB), live checks, demo seeding
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
3. Fill the rest of `.env.local` (see `.env.example`): `MONGODB_URI`, `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `STRAVA_CLIENT_ID/SECRET/REDIRECT_URI`, and optionally `SUPERMEMORY_API_KEY` (coach memory; without it the coach uses your past bets from the database).
4. `npm run dev` for a local backend against the real services, or deploy to Vercel and add the same variables there.
5. Point the app at it: `EXPO_PUBLIC_API_URL=https://<your-vercel-domain>` in `app/.env`.

`npm test` runs the payout-rule unit tests and the end-to-end API tests (35 tests: payouts, settlement, threads, GitHub/Duolingo, hiding, coach memory).

## Demo (3 minutes)

1. **Hook** — Butterfingers on the login screen; log in with a username.
2. **Create + join** — create a friends chess challenge (0.1 SOL); teammate joins with the invite code; open the escrow on Solana Explorer.
3. **Dare** — open a public dare → Record proof → say the word → Gemini verdict.
4. **Payout** — Demo tools → **End now**: leaderboard finalises, Butterfingers celebrates/fumbles, payout transaction on Explorer.
5. **Coach** — on the next bet's stake step, ask Butterfingers; he recalls a past bet.
6. **Wrap** — Strava sync on the profile, Clout unlocks, devnet only.

`DEMO_MODE=true` adds a 5-minute duration, a 10-second dispute window, "End now" and "Simulate progress".

## Honest limits (it's a hackathon MVP)

- Devnet only — no real money. Strava is simulated in demo mode. Wallets are custodial (keys encrypted with AES-256-GCM on the server).
- Login is a username with no password, by design for the demo: anyone who knows a username can log in as it.
- Settlement runs when a challenge is opened after its end time, plus a daily cron (Vercel Hobby limit).
