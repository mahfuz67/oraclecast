import { OracleCast } from "../src/oracle-cast.js";
import { Logger } from "../src/core/logger.js";

/**
 * Open / fund a SOL escrow toward a target agent.
 *   FUND_TARGET   agent PDA or wallet to pay (default: SENTINEL_AGENT)
 *   FUND_LAMPORTS price-per-call in lamports (default: 1000000)
 *   FUND_NONCE    escrow nonce (default: 0)
 *   FUND_MAXCALLS max calls (default: 10)
 */
const log = new Logger("script:fund");

async function main(): Promise<void> {
  const app = new OracleCast();
  const target = process.env.FUND_TARGET || app.config.env.SENTINEL_AGENT;
  const price = BigInt(process.env.FUND_LAMPORTS || "1000000");
  const nonce = BigInt(process.env.FUND_NONCE || "0");
  const maxCalls = BigInt(process.env.FUND_MAXCALLS || "10");

  if (app.config.dryRun) {
    log.warn(
      `DRY_RUN=1 — set DRY_RUN=0 to fund. Would fund ${target} (${price * maxCalls} lamports, nonce=${nonce}).`,
    );
    return;
  }
  const sig = await app.sap.fundEscrow(target, price, maxCalls, nonce);
  log.info(`escrow funded tx=${sig}`);
}

main().catch((e: Error) => {
  log.error("failed", e.stack ?? e.message);
  process.exit(1);
});
