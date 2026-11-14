# Bet On Me — MVP Build Spec (sunhacks 2026, team Moneyball)

> **How to use this file:** put it in the repo root as `SPEC.md`, then tell Claude Code:
> "Read SPEC.md and build the MVP in the order given in the Build Order section. Ask me for API keys when you need them. Use the Vercel and GitHub setup we have. Stop after each milestone so we can test on our phones."

**Deadline:** Devpost submission 11:00 AM Sunday Nov 15 (Arizona time). No late submissions. Aim to submit by 10:30.
**Judging:** Originality, Complexity, Functionality, Design. 3-minute live demo + 2 minutes of questions. The working app is judged, not slides.
**Prize tracks we're targeting:** Best Overall, MLH Best Use of Solana, MLH Best Use of Gemini API, MLH Best Use of MongoDB Atlas, MLH Best Domain (GoDaddy Registry), Best Mascot, Audience Vote.

---

## 1. One-liner

**Bet On Me** is a mobile app where friends (or strangers) put money in a pot on their own goals — run 20 miles this week, hit 1200 on chess.com, do a dare — and the app checks proof automatically and pays out the winners. Pots are held on **Solana devnet** (test money only — no real money in this MVP).

Mascot: **Butterfingers** — a nervous little stick of butter with tiny arms who keeps almost dropping a coin. He celebrates when you complete a challenge and slips and drops the coin when you fail.

---

## 2. Scope

### In the MVP
- Username login (no password, no verification).
- Each user gets a **custodial Solana devnet wallet** created by the backend, funded automatically on signup.
- Three challenge categories:
  1. **Running — Strava** (proof: Strava API activity data)
  2. **Chess — chess.com** (proof: chess.com public API rating)
  3. **Dare** (proof: in-app video with a random liveness word, checked by Gemini)
- Two visibilities: **Friends** (join by invite code) and **Public** (shown in a public feed).
- Challenge creator sets the stake; everyone who joins pays the same stake.
- Live leaderboard per challenge.
- Payout settlement on Solana devnet with Solana Explorer links shown in the app.
- **Points** (working name "Clout") that unlock more dares you can create and higher stake limits.
- Dare moderation: Gemini screens dare text at creation + downvote/report, auto-hide after 3 reports.
- **Demo mode** button to end a challenge instantly and settle it.

### Explicitly out of scope
- Real money, Stripe, KYC.
- Betting physical possessions (cut).
- Clash Royale / Valorant (cut — chess.com only for games).
- Passwords, email, push notifications.
- Android-specific work (we demo on iPhone via Expo Go).

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Mobile app | Expo (latest SDK), TypeScript, expo-router, run via **Expo Go** on iPhone |
| Camera | `expo-camera` (`CameraView` + `recordAsync`) |
| Backend | Node + TypeScript serverless functions on **Vercel** (`/api` folder) |
| Database | **MongoDB Atlas** (free cluster), official `mongodb` driver |
| File storage | **Vercel Blob** for dare videos (client uploads, so we skip Vercel's ~4.5 MB request body limit) |
| AI | **Gemini API** via `@google/genai`; model name read from `GEMINI_MODEL` env var (use the current Flash model that accepts video) |
| Blockchain | `@solana/web3.js` on **devnet** |

### Repo layout (monorepo)
```
/app        Expo app
/api        Vercel serverless functions (TypeScript)
/lib        shared types (Challenge, User, etc.) used by both
SPEC.md
README.md   setup + demo instructions (also reused for Devpost)
```

### Environment variables (backend)
```
MONGODB_URI=
GEMINI_API_KEY=
GEMINI_MODEL=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=https://<vercel-domain>/api/strava/callback
BLOB_READ_WRITE_TOKEN=
SOLANA_RPC_URL=https://api.devnet.solana.com
TREASURY_SECRET_KEY=        # base58 secret of a devnet wallet we pre-fund from faucet.solana.com
WALLET_ENCRYPTION_KEY=      # 32-byte key used to encrypt user wallet secrets at rest
DEMO_MODE=true
```
App env: `EXPO_PUBLIC_API_URL=https://<vercel-domain>`

---

## 4. Data model (MongoDB)

```ts
User {
  _id, username (unique, lowercase), createdAt,
  wallet: { publicKey: string, encryptedSecret: string },
  points: number,                    // "Clout"
  chessUsername?: string,
  strava?: { athleteId, accessToken, refreshToken, expiresAt },
  dareCreditsUsedThisWeek: number, weekStart: Date
}

Challenge {
  _id, title, description,
  category: "strava" | "chess" | "dare",
  visibility: "friends" | "public",
  inviteCode: string,                // 6 chars, for friends challenges
  mode: "target" | "open",           // target = hit a goal; open = most progress wins
  target?: number,                   // miles (strava), rating (chess); dares are always target
  dareText?: string,
  stakeLamports: number,             // set by creator, same for everyone
  startsAt, endsAt,
  status: "active" | "settling" | "settled" | "banned",
  escrow: { publicKey, encryptedSecret },  // one devnet keypair per challenge
  creatorId,
  participants: [{
    userId, username, joinedAt,
    stakeTxSig: string,
    baseline?: number,               // chess rating at join time
    progress: number,                // miles, rating gain, or 0/1 for dare
    completed: boolean,
    lastSyncedAt?: Date
  }],
  settlement?: { winners: [userId], payouts: [{ userId, lamports, txSig }], reason: string, settledAt },
  upvotes: number, downvotes: number, reports: [{ userId, reason, at }]
}

DareProof {
  _id, challengeId, userId,
  livenessWord: string, wordIssuedAt: Date,
  videoUrl?: string,
  gemini?: { verdict: "pass" | "fail" | "unsure", reason: string, checkedAt },
  disputes: [{ userId, at }],
  votes: [{ userId, approve: boolean }],
  finalStatus: "pending" | "approved" | "rejected"
}
```

---

## 5. Core rules

### Stakes
- Creator sets `stakeLamports` when creating the challenge. Joiners pay the same amount.
- Joining = backend transfers stake from the user's custodial wallet to the challenge escrow wallet, saves the tx signature.
- Max stake allowed depends on points (see Points). Default presets in the UI: 0.05 / 0.1 / 0.5 / 1 SOL.

### Settlement (run when `endsAt` passes, or when the Demo "End now" button is pressed)

**Target challenges** (Strava miles target, chess rating target, all dares):
1. **Everyone completed** → everyone gets their stake back.
2. **Some completed** → completers split the whole pot equally.
3. **Nobody completed** →
   - Strava/chess: the **leader** (most progress) takes the whole pot. Ties split.
   - Dare: no progress to compare, so **refund everyone**.

**Open challenges** ("most miles this week", "most rating gained"):
- The **leader** (most progress) takes the whole pot. Ties split equally.
- If nobody made any progress → refund everyone.

Settlement sends real devnet transactions from escrow → winners and stores signatures. The app shows each payout with a link to `https://explorer.solana.com/tx/<sig>?cluster=devnet`.

Rounding: split lamports with integer division; leftover lamports go to the first winner. Leave enough lamports in escrow for fees (pay fees from the escrow; the treasury tops up the escrow with 0.01 SOL when it is created).

### Points ("Clout")
- +10 for joining a challenge, +50 for completing one, +100 for winning a pot, −20 for failing.
- Points unlock:
  - **Public dares you can create per week:** 1 at 0 pts, 3 at 200 pts, 10 at 1000 pts.
  - **Max stake:** 0.1 SOL at 0 pts, 0.5 SOL at 200 pts, 2 SOL at 1000 pts.
- Show the user's points and the next unlock on the profile screen.

---

## 6. Proof of completion

### 6.1 Strava (running)
- OAuth: app opens `https://www.strava.com/oauth/mobile/authorize` (or web authorize) with `redirect_uri=STRAVA_REDIRECT_URI`, scope `activity:read_all`, `state=<userId>`. Backend `/api/strava/callback` exchanges the code for tokens, saves them on the user, then redirects to the app deep link (from `Linking.createURL('/strava-connected')`).
- Refresh tokens when `expiresAt` has passed.
- Sync: `GET https://www.strava.com/api/v3/athlete/activities?after=<startsAt epoch>&before=<endsAt epoch>`; sum `distance` (meters → miles) for activities with `type` or `sport_type` of Run/Walk (configurable).
- **Anti-cheat:** ignore activities where `manual === true` (typed-in activities, not GPS recorded). Show "Manual activities don't count" in the UI.
- `progress` = total miles. `completed` = progress ≥ target (target mode).
- **Known risk:** as far as we know, new Strava API apps start limited to the app owner's own account until Strava reviews them. Whoever creates the Strava API app should be the person whose Strava account is used in the demo. If the second account can't connect, the second person demos chess/dare instead, or uses Demo Mode's "simulate sync".
- **Setup to-do (humans):** both teammates create Strava accounts tonight and record at least one short GPS walk/run with the Strava app so there's real data to show.

### 6.2 Chess (chess.com)
- User enters their chess.com username on the profile screen; backend validates it with `GET https://api.chess.com/pub/player/{username}` (send a descriptive `User-Agent` header).
- Rating: `GET https://api.chess.com/pub/player/{username}/stats` → use `chess_rapid.last.rating` by default; let the creator choose rapid/blitz/bullet when creating.
- On join, store `baseline` = current rating.
- **Target mode:** `completed` = current rating ≥ target. `progress` = current rating.
- **Open mode:** `progress` = current rating − baseline (rating gained). Leader wins.
- Sync on "Sync progress" button and when the challenge detail screen opens (cache at most once per 60 s per user).

### 6.3 Dare (video + Gemini + people)
1. **Dare creation screening:** when a dare challenge is created, send `dareText` + the community guidelines (below) to Gemini; it returns `{ allowed: boolean, reason }`. Blocked dares can't be created; show the reason.
2. **Liveness word:** when the user taps "Record proof", the backend issues a random word (e.g. "pineapple") stored on a new `DareProof`, valid for 5 minutes. The app shows the word on screen: "Say **pineapple** out loud in your video."
3. **Record in-app only** (no camera-roll uploads). Limit clips to 15 seconds, low/medium quality.
4. **Upload** directly to Vercel Blob with a client upload token from `/api/dare/upload-token`, then call `/api/dare/verify` with the blob URL.
5. **Gemini check:** send the video + dare text + liveness word. Prompt asks for JSON `{ verdict: "pass"|"fail"|"unsure", reason: string }`: pass only if the video clearly shows the dare being done AND the person says the word. Set function `maxDuration` to 60 s.
6. **People check:**
   - Friends challenges: if verdict is pass, other participants have a dispute window (2 hours; **10 seconds in DEMO_MODE**). A dispute triggers a vote among participants; majority decides.
   - Public challenges: verdict "unsure" or a report → community vote (MVP: other participants vote; simple majority).
   - Final `approved` → participant `completed = true`.

### Community guidelines (used for Gemini screening + shown in app)
No dares involving: physical danger or injury, illegal activity, alcohol/drugs, sexual content, harassing or filming people without consent, property damage, or anything targeting a specific person. Dares should be funny, embarrassing-but-harmless, social, or physical-but-safe.

### Moderation
- Public challenges can be upvoted, downvoted, and reported.
- At **3 reports** (or downvotes − upvotes ≥ 5) the challenge is auto-hidden with status `banned`; stakes are refunded.

---

## 7. API endpoints (`/api`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{username}` → create user if new (wallet + funding), return user + simple session token |
| GET | `/api/me` | current user, points, wallet balance (SOL), connected accounts |
| POST | `/api/me/chess` | set + validate chess.com username |
| GET | `/api/strava/connect` | returns Strava authorize URL |
| GET | `/api/strava/callback` | OAuth callback → save tokens → redirect to app |
| POST | `/api/challenges` | create challenge (validates stake vs points, dare screening, creates escrow) |
| GET | `/api/challenges?visibility=public` | public feed (active, not banned), sorted by pot size then newest |
| GET | `/api/challenges/mine` | challenges I created or joined |
| GET | `/api/challenges/:id` | detail + leaderboard |
| POST | `/api/challenges/join` | `{challengeId}` or `{inviteCode}` → transfer stake → add participant |
| POST | `/api/challenges/:id/sync` | refresh progress for all participants (Strava/chess) |
| POST | `/api/challenges/:id/vote` | up/down vote |
| POST | `/api/challenges/:id/report` | report with reason |
| POST | `/api/challenges/:id/settle` | settle (cron or demo) |
| POST | `/api/demo/end-now` | DEMO_MODE only: set `endsAt = now`, sync, settle |
| POST | `/api/demo/simulate-progress` | DEMO_MODE only: add fake miles/rating for a user (fallback if an API fails live) |
| POST | `/api/dare/start` | issue liveness word, create DareProof |
| POST | `/api/dare/upload-token` | Vercel Blob client upload token |
| POST | `/api/dare/verify` | run Gemini on uploaded video |
| POST | `/api/dare/:proofId/dispute` | dispute a pass |
| POST | `/api/dare/:proofId/vote` | approve/reject vote |

Auth for MVP: login returns a random session token stored on the user; app sends it as `Authorization: Bearer <token>`. No passwords.

Settlement trigger: a Vercel Cron hitting a `/api/cron/settle-due` endpoint every 5 minutes is enough; Demo Mode covers the live demo.

---

## 8. Solana (devnet) details
- **Treasury wallet:** we create one devnet keypair before the event, fund it from `faucet.solana.com` (several times), and put its secret in `TREASURY_SECRET_KEY`. Do NOT rely on `requestAirdrop` per user — it's rate-limited and flaky.
- **New user:** backend generates a `Keypair`, encrypts the secret with `WALLET_ENCRYPTION_KEY` (AES-256-GCM), stores it, and sends **2 SOL** from the treasury.
- **New challenge:** backend generates an escrow `Keypair` (encrypted the same way), treasury sends 0.01 SOL to it for fees/rent.
- **Join:** `SystemProgram.transfer` user → escrow for `stakeLamports`.
- **Settle:** transfers escrow → each winner.
- Always confirm transactions (`confirmed` commitment) and store signatures. Show Explorer links in the app — this is a key demo moment.
- Show "Devnet — test money only" in the app header/footer.

---

## 9. App screens (Expo Router)

1. **Login** — big Butterfingers, app name, username field, "Let's go" button.
2. **Home** (tabs):
   - **My Challenges** — cards with title, category icon, pot size, time left, my rank.
   - **Public (Live)** — public feed; cards show pot size, # players, time left, live badge; up/down vote buttons.
   - **+ Create** button.
3. **Create Challenge** — step form: category → mode (target/open) → goal (miles / rating + time control / dare text) → stake (presets, capped by points) → duration (1 day / 3 days / 1 week; DEMO_MODE adds "5 minutes") → visibility. Friends: show invite code + share sheet after creation.
4. **Join by code** — 6-char input.
5. **Challenge Detail** — title, rules, pot (SOL), countdown, **leaderboard** (rank, username, progress bar, completed ✓), my action button:
   - Strava: "Connect Strava" or "Sync runs"
   - Chess: "Set chess.com username" or "Sync rating"
   - Dare: "Record proof"
   - Report / vote buttons (public)
   - **Demo: "⚡ End now"** (only when DEMO_MODE)
   - After settlement: results card with winners, payouts, Explorer links, and Butterfingers reacting.
6. **Dare Recorder** — shows the liveness word big on screen, 15 s countdown recording, upload progress, then Gemini verdict screen ("Butterfingers is checking your proof…" → pass/fail/unsure + reason).
7. **Profile** — username, wallet address (copy), SOL balance, points + progress to next unlock, connected accounts (Strava, chess.com), history of results.

Poll challenge detail every 10 s while open so the leaderboard feels live.

### Butterfingers (mascot) states
Build as simple SVG components (`react-native-svg`) or images, with these states:
- `idle` — holding a coin, slightly sweaty
- `nervous` — sweating more (challenge ending soon and user hasn't completed)
- `celebrate` — throwing the coin in the air (completed / won)
- `fumble` — slipped, coin rolling away (failed / lost)
- `thinking` — magnifying glass (waiting for Gemini)
Small bounce animation with `Animated` or `react-native-reanimated`.

### Visual style
Bold, playful, high contrast. Butter-yellow (#FFD84D) primary, near-black background or off-white cards, rounded corners, chunky sans-serif. Money amounts big and bold. Should look good in a 3-minute demo on a projected phone screen.

---

## 10. Build order (stop and test after each milestone)

**M0 — Setup (target: done by 3:00 PM Sat)**
- GitHub repo, Vercel project, Expo app runs on both iPhones via Expo Go.
- MongoDB Atlas cluster, Gemini key, treasury wallet funded, env vars set.
- Both teammates create Strava + chess.com accounts; one creates the Strava API app.

**M1 — Users, wallets, challenges, money (by 7:00 PM)**
- Login, custodial wallet + 2 SOL funding, profile with balance.
- Create challenge (escrow), join by code, stake transfer, challenge detail.
- Settlement logic + Demo "End now" + Explorer links. Unit-test the payout rules.

**M2 — Chess.com end-to-end (by 9:00 PM)**
- Set username, baseline on join, sync, leaderboard, target + open modes.
- *At this point we have a complete demoable product. Commit and tag `demo-safe-1`.*

**M3 — Strava (by 11:30 PM)**
- OAuth via backend + deep link, token refresh, sync miles, ignore manual activities.

**M4 — Dares + Gemini (by 3:00 AM)**
- Dare screening at creation, liveness word, in-app recording, Blob upload, Gemini verdict, dispute + vote.
- Tag `demo-safe-2`.

**M5 — Public + points + moderation + mascot polish (by 7:00 AM)**
- Public feed, voting, reports/auto-ban, points + unlocks, Butterfingers states, visual polish.

**M6 — Ship (7:00–10:30 AM)**
- Seed demo data (one finished public challenge with payouts, one live public dare, one friends Strava challenge).
- Rehearse the 3-minute demo twice. Record a backup demo video.
- Devpost write-up from README; opt into Solana, Gemini, MongoDB Atlas, GoDaddy domain tracks; add domain.
- **Submit by 10:30 AM.**

Rule: if a milestone is more than 1.5 hours late, cut the least important part of the next milestone (in this order: open-mode challenges → disputes/votes → points unlocks → public feed voting).

---

## 11. Demo script (3 minutes)

1. **(0:00–0:20) Hook:** "Ever said you'd hit the gym 5 times this week and didn't? Bet On Me makes you put money on yourself." Show Butterfingers.
2. **(0:20–1:00) Create + join:** create a friends chess challenge with a 0.1 SOL stake; teammate joins with the invite code on their phone. Show both stakes landing in escrow (Explorer link).
3. **(1:00–1:50) Dare live:** open a public dare, tap Record, the app shows a random word, record 5 seconds saying it while doing the dare, and Gemini returns "pass" with a reason. Mention guideline screening + reports.
4. **(1:50–2:30) Payout:** hit "⚡ End now" on the challenge: leaderboard finalizes, Butterfingers celebrates for the winner and fumbles for the loser, payout tx on Solana Explorer.
5. **(2:30–3:00) Wrap:** Strava runs (show connected profile + synced miles), points unlock more dares and higher stakes, devnet-only for now, real money would need compliance work.

Prepared answers for Q&A: why Solana (instant, near-zero fees, transparent escrow), how cheating is prevented (no manual Strava runs, live chess.com data, liveness word + AI + people for dares), why it's safe (guidelines, AI screening, reports, auto-ban), what's next (Apple Health/gym check-ins, real on-chain escrow program, more games).

---

## 12. Definition of done for the MVP
- Two iPhones can log in, create, join, and settle a chess challenge with real devnet transactions.
- A dare can be recorded, checked by Gemini, and marked complete.
- At least one Strava account connects and syncs miles (or the fallback is ready).
- Public feed shows challenges; reports can ban one.
- Butterfingers reacts to win/lose.
- README explains setup + demo; Devpost submitted before 11:00 AM.
