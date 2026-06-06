import { createHash } from "node:crypto";
import { BN, Wallet } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SapClient, Pdas, SEEDS } from "@oobe-protocol-labs/synapse-sap-sdk";
import { Config } from "../core/config.js";
import { Logger } from "../core/logger.js";
import { Solana } from "../core/solana.js";
import type { Receipt } from "../core/receipt.js";
import type { MarketSignal } from "./synapse.service.js";

export const ORACLECAST_CAPABILITY = "oracle:briefing";
const SENTINEL_FEE_LAMPORTS = 1_000_000n;

export interface AgentAccount {
  name: string;
  x402_endpoint: string | null;
  agent_uri: string | null;
  [key: string]: unknown;
}

export type RiskLabel = "low" | "moderate" | "elevated" | "high";

export interface RiskAssessment {
  score: number;
  label: RiskLabel;
  rationale: string;
  source: "sentinel-endpoint" | "sentinel-escrow+local";
  escrowSignature?: string;
}

export interface SettleResult {
  settled: boolean;
  signature?: string;
  amount?: string;
  reason?: string;
}

/** Synapse Agent Protocol (SAP) integration: agent registration, consuming the
 *  Synapse Sentinel agent via on-chain escrow, and sell-side call settlement.
 *  Registration uses the SDK's `AgentModule`; escrow/settle use the SapClient's
 *  Anchor `program` (the shipped IDL resolves the remaining PDAs itself). */
export class SapService {
  private readonly client: SapClient;
  private readonly log = new Logger("sap");

  constructor(
    private readonly config: Config,
    private readonly solana: Solana,
  ) {
    this.client = new SapClient({
      connection: solana.connection,
      wallet: new Wallet(solana.keypair),
    });
    this.log.info(`program ${this.client.programId.toBase58()}`);
  }

  myAgentPda(): PublicKey {
    return Pdas.getAgentPDA(this.solana.keypair.publicKey)[0];
  }

  async fetchAgent(pda: PublicKey): Promise<AgentAccount | null> {
    try {
      return (await this.client.program.account.agentAccount.fetch(pda)) as unknown as AgentAccount;
    } catch {
      return null;
    }
  }

  async resolveAgent(
    idOrWallet: string,
  ): Promise<{ agentPda: PublicKey; account: AgentAccount | null }> {
    const candidate = new PublicKey(idOrWallet);
    const asPda = await this.fetchAgent(candidate);
    if (asPda) return { agentPda: candidate, account: asPda };
    const derived = Pdas.getAgentPDA(candidate)[0];
    return { agentPda: derived, account: await this.fetchAgent(derived) };
  }

  /** Register OracleCast on SAP (idempotent). */
  async register(receipt: Receipt): Promise<string> {
    const { env } = this.config;
    const wallet = this.solana.keypair;
    const agent = this.myAgentPda();

    if (await this.fetchAgent(agent)) {
      this.log.info(`already registered ${agent.toBase58()}`);
      return agent.toBase58();
    }

    const capabilities = [
      {
        id: ORACLECAST_CAPABILITY,
        description: "Autonomous multimedia Solana market briefing (text + image + audio).",
        protocolId: "oraclecast",
        version: "1.0.0",
      },
    ];
    const pricing: never[] = [];

    if (this.config.dryRun) {
      this.log.info(`[dry-run] would register "${env.AGENT_NAME}" at ${agent.toBase58()}`);
      receipt.record({
        kind: "register",
        description: `register "${env.AGENT_NAME}" — simulated`,
        simulated: true,
      });
      return agent.toBase58();
    }

    const ix = await this.client.agent.registerAgent({
      signer: wallet,
      wallet: wallet.publicKey,
      agent,
      agentStats: Pdas.getAgentStatsPDA(agent)[0],
      globalRegistry: Pdas.getGlobalPDA()[0],
      name: env.AGENT_NAME,
      description: env.AGENT_DESCRIPTION,
      capabilities,
      pricing,
      protocols: ["oraclecast"],
      agentId: null,
      agentUri: env.AGENT_URI || null,
      x402Endpoint: env.AGENT_X402_ENDPOINT || null,
    });
    const sig = await this.client.sendTransaction(
      await this.client.buildTransaction([ix], wallet.publicKey),
      [wallet],
    );
    this.log.info(`registered tx=${sig}`);
    receipt.record({
      kind: "register",
      description: `register "${env.AGENT_NAME}"`,
      signature: sig,
      simulated: false,
    });
    return agent.toBase58();
  }

  /** Consume the Synapse Sentinel agent by funding a SOL escrow toward it, then
   *  derive a risk read (its published endpoint if any, else a local heuristic). */
  async assessWithSentinel(signal: MarketSignal, receipt: Receipt): Promise<RiskAssessment> {
    const { score, rationale } = SapService.localRisk(signal);

    if (this.config.dryRun) {
      this.log.info("[dry-run] simulating Sentinel escrow");
      receipt.record({
        kind: "sentinel",
        description: "Sentinel escrow deposit — simulated",
        amount: SENTINEL_FEE_LAMPORTS.toString(),
        asset: "lamports",
        simulated: true,
      });
      return { score, rationale, label: SapService.label(score), source: "sentinel-escrow+local" };
    }

    const { agentPda, account } = await this.resolveAgent(this.config.env.SENTINEL_AGENT);
    if (!account) throw new Error(`no on-chain agent for ${this.config.env.SENTINEL_AGENT}`);
    this.log.info(`sentinel ${agentPda.toBase58()} ("${account.name}")`);

    const fee = new BN(SENTINEL_FEE_LAMPORTS.toString());
    const sig = await this.client.program.methods
      .createEscrowV2(
        new BN(Math.floor(Date.now() / 1000)),
        fee,
        new BN(1),
        fee,
        new BN(0),
        [],
        null,
        9,
        0,
        new BN(0),
        null,
        null,
      )
      .accounts({ depositor: this.solana.keypair.publicKey, agent: agentPda })
      .rpc();
    this.log.info(`sentinel escrow tx=${sig}`);
    receipt.record({
      kind: "sentinel",
      description: `Sentinel escrow deposit toward ${agentPda.toBase58()}`,
      signature: sig,
      amount: SENTINEL_FEE_LAMPORTS.toString(),
      asset: "lamports",
      simulated: false,
    });

    const assessment = await this.querySentinelEndpoint(account, signal, score, rationale);
    return { ...assessment, escrowSignature: sig };
  }

  /** Settle one call against a subscriber's escrow (sell-side volume). No-op
   *  unless SUBSCRIBER_PUBKEY is configured and a funded escrow exists. */
  async settleSubscriber(briefingId: string, receipt: Receipt): Promise<SettleResult> {
    const { SUBSCRIBER_PUBKEY, SUBSCRIBER_ESCROW_NONCE, PRICE_PER_CALL } = this.config.env;
    if (!SUBSCRIBER_PUBKEY) return { settled: false, reason: "no SUBSCRIBER_PUBKEY configured" };

    const subscriber = new PublicKey(SUBSCRIBER_PUBKEY);
    const escrow = this.escrowPda(this.myAgentPda(), subscriber, SUBSCRIBER_ESCROW_NONCE);
    const hash = Array.from(createHash("sha256").update(briefingId).digest());

    if (this.config.dryRun) {
      receipt.record({
        kind: "escrow-settle",
        description: `settle 1 call (subscriber ${subscriber.toBase58()}) — simulated`,
        amount: PRICE_PER_CALL.toString(),
        asset: "lamports",
        simulated: true,
      });
      return { settled: true, amount: PRICE_PER_CALL.toString() };
    }

    const exists = await this.client.program.account.escrowAccountV2
      .fetch(escrow)
      .catch(() => null);
    if (!exists) return { settled: false, reason: "subscriber escrow not found" };

    const sig = await this.client.program.methods
      .settleCallsV2(new BN(SUBSCRIBER_ESCROW_NONCE.toString()), new BN(1), hash)
      .accounts({ wallet: this.solana.keypair.publicKey, escrow })
      .rpc();
    receipt.record({
      kind: "escrow-settle",
      description: `settle 1 call from subscriber ${subscriber.toBase58()}`,
      signature: sig,
      amount: PRICE_PER_CALL.toString(),
      asset: "lamports",
      simulated: false,
    });
    return { settled: true, signature: sig, amount: PRICE_PER_CALL.toString() };
  }

  /** Open / fund a SOL escrow toward a target agent (subscriber or Sentinel). */
  async fundEscrow(
    targetIdOrWallet: string,
    priceLamports: bigint,
    maxCalls: bigint,
    nonce: bigint,
  ): Promise<string> {
    const { agentPda, account } = await this.resolveAgent(targetIdOrWallet);
    if (!account) throw new Error(`no on-chain agent for ${targetIdOrWallet}`);
    const deposit = priceLamports * maxCalls;
    const sig = await this.client.program.methods
      .createEscrowV2(
        new BN(nonce.toString()),
        new BN(priceLamports.toString()),
        new BN(maxCalls.toString()),
        new BN(deposit.toString()),
        new BN(0),
        [],
        null,
        9,
        0,
        new BN(0),
        null,
        null,
      )
      .accounts({ depositor: this.solana.keypair.publicKey, agent: agentPda })
      .rpc();
    this.log.info(`escrow funded tx=${sig} (deposit=${deposit} lamports, nonce=${nonce})`);
    return sig;
  }

  /** EscrowV2 PDA: [sap_escrow_v2, agent, depositor, nonce_u64_le]. */
  escrowPda(agent: PublicKey, depositor: PublicKey, nonce: bigint): PublicKey {
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(nonce);
    return PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.ESCROW_V2), agent.toBuffer(), depositor.toBuffer(), nonceBuf],
      this.client.programId,
    )[0];
  }

  private async querySentinelEndpoint(
    account: AgentAccount,
    signal: MarketSignal,
    score: number,
    rationale: string,
  ): Promise<RiskAssessment> {
    const endpoint = account.x402_endpoint ?? account.agent_uri ?? undefined;
    if (endpoint && /^https?:\/\//.test(endpoint)) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ signal }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const j: any = await res.json().catch(() => null);
          const s = Number(j?.score ?? j?.risk ?? NaN);
          if (!Number.isNaN(s)) {
            const clamped = Math.max(0, Math.min(100, s));
            return {
              score: clamped,
              rationale: j?.rationale ?? rationale,
              label: SapService.label(clamped),
              source: "sentinel-endpoint",
            };
          }
        }
      } catch (err) {
        this.log.warn("sentinel endpoint failed; using local heuristic", (err as Error).message);
      }
    }
    return { score, rationale, label: SapService.label(score), source: "sentinel-escrow+local" };
  }

  private static localRisk(signal: MarketSignal): { score: number; rationale: string } {
    let score = 20;
    if (signal.tps < 1000) score += 30;
    else if (signal.tps < 2000) score += 15;
    const dead = signal.watched.filter((w) => w.recentTxns === 0).length;
    score += dead * 10;
    score = Math.max(0, Math.min(100, score));
    return {
      score,
      rationale: `TPS=${signal.tps}, inactive watched venues=${dead}/${signal.watched.length}, epoch progress=${signal.epochProgressPct}%.`,
    };
  }

  private static label(score: number): RiskLabel {
    if (score < 25) return "low";
    if (score < 50) return "moderate";
    if (score < 75) return "elevated";
    return "high";
  }
}
