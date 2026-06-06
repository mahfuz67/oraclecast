import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const path = process.env.WALLET_PATH ?? "./wallet.json";

let kp: Keypair;
try {
  kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
} catch (err) {
  console.error(`Could not read a keypair from ${path}: ${(err as Error).message}`);
  process.exit(1);
}

console.log(`Public key  : ${kp.publicKey.toBase58()}`);
console.log(`Private key (base58 — import into Phantom; KEEP SECRET, never commit):`);
console.log(bs58.encode(kp.secretKey));
