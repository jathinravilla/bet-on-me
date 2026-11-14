// Prints the treasury's devnet balance so you know how many sign-ups it can fund.
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

const secret = process.env.TREASURY_SECRET_KEY;
if (!secret) throw new Error("TREASURY_SECRET_KEY missing — run `npm run keys` first.");
const kp = Keypair.fromSecretKey(bs58.decode(secret));
new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed")
  .getBalance(kp.publicKey)
  .then((l) => console.log(`${kp.publicKey.toBase58()}  ${l / LAMPORTS_PER_SOL} SOL`));
