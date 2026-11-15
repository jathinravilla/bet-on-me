// Solana devnet custody: treasury, per-user wallets and per-challenge escrow wallets.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "./crypto";
import { cols, type WalletDoc } from "./db";
import { RPC_URL, SOLANA_MOCK, need } from "./env";
import { HttpError } from "./http";

let _conn: Connection | undefined;
const conn = () => (_conn ??= new Connection(RPC_URL(), "confirmed"));

let _treasury: Keypair | undefined;
export function treasury(): Keypair {
  if (_treasury) return _treasury;
  if (SOLANA_MOCK() && !process.env.TREASURY_SECRET_KEY) return (_treasury = Keypair.generate());
  const raw = need("TREASURY_SECRET_KEY").trim();
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
  return (_treasury = Keypair.fromSecretKey(bytes));
}

export function newWallet(): { doc: WalletDoc; keypair: Keypair } {
  const keypair = Keypair.generate();
  return { keypair, doc: { publicKey: keypair.publicKey.toBase58(), encryptedSecret: encrypt(keypair.secretKey) } };
}

export const keypairOf = (w: WalletDoc) => Keypair.fromSecretKey(Uint8Array.from(decrypt(w.encryptedSecret)));

export interface Move {
  from: Keypair;
  to: string;
  lamports: number;
}

// The Solana Memo program lets a transaction carry a short public note. We use it to stamp every
// settlement with a fingerprint of the result, so anyone can check it on Solana Explorer.
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Send one confirmed transaction containing all the given transfers (and an optional memo). Returns its signature. */
export async function transfer(moves: Move[], feePayer: Keypair, memo?: string): Promise<string> {
  if (moves.length === 0) throw new Error("No transfers.");
  if (SOLANA_MOCK()) return mockTransfer(moves);
  const tx = new Transaction();
  for (const m of moves) {
    tx.add(SystemProgram.transfer({ fromPubkey: m.from.publicKey, toPubkey: new PublicKey(m.to), lamports: m.lamports }));
  }
  if (memo) tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: moves[0].from.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") }));
  tx.feePayer = feePayer.publicKey;
  const signers = [feePayer];
  for (const m of moves) if (!signers.some((s) => s.publicKey.equals(m.from.publicKey))) signers.push(m.from);
  try {
    return await sendAndConfirmTransaction(conn(), tx, signers, { commitment: "confirmed", maxRetries: 5 });
  } catch (e) {
    console.error("solana transfer failed:", e instanceof Error ? e.message : e);
    throw new HttpError(502, "The Solana devnet transaction failed. Please try again.");
  }
}

export async function balance(publicKey: string): Promise<number> {
  if (SOLANA_MOCK()) {
    const { ledger } = await cols();
    return (await ledger.findOne({ _id: publicKey }))?.lamports ?? 0;
  }
  try {
    return await conn().getBalance(new PublicKey(publicKey), "confirmed");
  } catch (e) {
    console.error("solana balance failed:", e instanceof Error ? e.message : e);
    throw new HttpError(502, "Couldn't reach Solana devnet. Please try again.");
  }
}

// ---- local-testing fake chain (balances kept in Mongo; the treasury is bottomless) ----
async function mockTransfer(moves: Move[]): Promise<string> {
  const { ledger } = await cols();
  const t = treasury().publicKey.toBase58();
  for (const m of moves) {
    const from = m.from.publicKey.toBase58();
    if (from !== t) {
      const r = await ledger.updateOne({ _id: from, lamports: { $gte: m.lamports } }, { $inc: { lamports: -m.lamports } });
      if (r.modifiedCount !== 1) throw new HttpError(400, "Insufficient funds.");
    }
    await ledger.updateOne({ _id: m.to }, { $inc: { lamports: m.lamports } }, { upsert: true });
  }
  return "MOCK" + bs58.encode(randomBytes(40));
}
