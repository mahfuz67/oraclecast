import { PublicKey } from "@solana/web3.js";
import { OracleCast } from "../src/oracle-cast.js";
import { Logger } from "../src/core/logger.js";

const log = new Logger("script:balances");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function main(): Promise<void> {
  const app = new OracleCast();
  const { connection, keypair } = app.solana;

  const sol = await connection.getBalance(keypair.publicKey).catch(() => 0);
  log.info(`wallet      : ${keypair.publicKey.toBase58()}`);
  log.info(`SOL balance : ${(sol / 1e9).toFixed(4)} SOL`);

  try {
    const accs = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: USDC });
    log.info(
      `USDC balance: ${accs.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0} USDC`,
    );
  } catch {
    log.info("USDC balance: (unable to read)");
  }

  const agentPda = app.sap.myAgentPda();
  const agent = await app.sap.fetchAgent(agentPda).catch(() => null);
  log.info(
    `agent PDA   : ${agentPda.toBase58()} -> ${agent ? `REGISTERED ("${agent.name}")` : "not registered"}`,
  );

  const sentinel = await app.sap.resolveAgent(app.config.env.SENTINEL_AGENT).catch(() => null);
  log.info(
    `sentinel    : ${app.config.env.SENTINEL_AGENT} -> ${sentinel?.account ? `OK ("${sentinel.account.name}")` : "unresolved"}`,
  );
  log.info(`DRY_RUN=${app.config.dryRun} rpc=${app.config.rpcUrl}`);
}

main().catch((e: Error) => {
  log.error("failed", e.stack ?? e.message);
  process.exit(1);
});
