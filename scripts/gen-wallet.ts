import { writeFileSync, existsSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

const path = process.env.WALLET_OUT ?? "./wallet.json";

if (existsSync(path) && process.env.FORCE !== "1") {
  console.error(`${path} already exists. Set FORCE=1 to overwrite.`);
  process.exit(1);
}

const kp = Keypair.generate();
writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));

console.log(`Wrote keypair to ${path} (gitignored).`);
console.log(`Public key — FUND THIS with SOL + USDC:`);
console.log(kp.publicKey.toBase58());
