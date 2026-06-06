import { readFileSync } from "node:fs";
import { Connection, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { SolanaWalletAdapter } from "@acedatacloud/x402-client";
import { Config } from "./config.js";
import { Logger } from "./logger.js";

/** Solana runtime context: the agent keypair, an RPC connection, and the
 *  x402 wallet adapter used by the Ace Data Cloud SDK for on-chain payments. */
export class Solana {
  readonly keypair: Keypair;
  readonly connection: Connection;
  private readonly log = new Logger("solana");

  constructor(private readonly config: Config = Config.get()) {
    this.keypair = this.loadKeypair();
    this.connection = new Connection(config.txRpcUrl, "confirmed");
    this.log.info(`wallet ${this.keypair.publicKey.toBase58()}`);
  }

  private loadKeypair(): Keypair {
    const { WALLET_SECRET_KEY, WALLET_PATH } = this.config.env;
    if (WALLET_SECRET_KEY) {
      const v = WALLET_SECRET_KEY.trim();
      return v.startsWith("[")
        ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(v)))
        : Keypair.fromSecretKey(bs58.decode(v));
    }
    if (WALLET_PATH) {
      try {
        return Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8"))),
        );
      } catch (err) {
        if (!this.config.dryRun) throw err;
        this.log.warn(`WALLET_PATH unreadable; using ephemeral key (DRY_RUN)`);
        return Keypair.generate();
      }
    }
    if (this.config.dryRun) {
      this.log.warn("no wallet configured; using ephemeral key (DRY_RUN)");
      return Keypair.generate();
    }
    throw new Error("Set WALLET_PATH or WALLET_SECRET_KEY for LIVE execution.");
  }

  /** Adapter matching `@acedatacloud/x402-client`'s `SolanaWalletAdapter`. The
   *  x402 signer builds a (blockhash + feePayer ready) tx and calls this. */
  x402Adapter(): SolanaWalletAdapter {
    const { keypair, connection, log } = this;
    return {
      publicKey: {
        toBase58: () => keypair.publicKey.toBase58(),
        toString: () => keypair.publicKey.toBase58(),
      },
      async signAndSendTransaction(tx: unknown): Promise<{ signature: string }> {
        const tx2 = tx as Transaction | VersionedTransaction;
        if (tx2 instanceof VersionedTransaction) tx2.sign([keypair]);
        else (tx2 as Transaction).sign(keypair);
        const sig = await connection.sendRawTransaction(tx2.serialize());
        await connection.confirmTransaction(sig, "confirmed");
        log.info(`x402 payment confirmed ${sig}`);
        return { signature: sig };
      },
    };
  }
}
