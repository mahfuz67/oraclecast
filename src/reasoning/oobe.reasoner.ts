import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { MerkleTreeManager } from "oobe-protocol";
import { Logger } from "../core/logger.js";
import { OobeCoreProvider, type OobeAgent } from "./oobe-core.provider.js";
import type { Receipt } from "../core/receipt.js";
import type { MarketSignal } from "../services/synapse.service.js";
import type { RiskAssessment, RiskLabel } from "../services/sap.service.js";

export type Stance = "accumulate" | "neutral" | "cautious" | "defensive";

export interface StanceRecord {
  id: string;
  at: string;
  stance: Stance;
  conviction: number;
  rationale: string;
  epoch: number;
  riskLabel: RiskLabel;
}

export interface OracleStance extends StanceRecord {
  provider: string;
  merkleRoot: string;
  merkleProof: string[];
  memoryDepth: number;
  inscriptionSignature?: string;
}

const PERSONA = {
  name: "OracleCast",
  role: "Autonomous Solana market analyst",
  traits: "rigorous, concise, risk-aware, non-hyperbolic",
  mandate:
    "Translate on-chain signals and a Sentinel risk read into one decisive, defensible stance. Never hype.",
};

/**
 * OracleCast's reasoning core on the OOBE Protocol SDK. Uses the documented
 * `OobeCore` agent (`genAi()` model + `getDefaultPersonality()`) to decide a
 * market stance, then commits the decision to a Merkle tree: off-chain via
 * `MerkleTreeManager` (always, for a verifiable root + proof) and on-chain via
 * `agent.merkleValidate()` + `agent.merkle.onChainMerkleInscription()` when a
 * live OobeCore agent is available.
 */
export class OobeReasoner {
  private readonly log = new Logger("oobe");
  private readonly memoryFile = join(process.cwd(), "out", ".oracle-memory.json");
  private readonly memoryDepth = 5;

  constructor(private readonly core: OobeCoreProvider) {}

  async decideStance(
    signal: MarketSignal,
    risk: RiskAssessment,
    context: string,
    receipt: Receipt,
  ): Promise<OracleStance> {
    const memory = this.loadMemory();
    const agent = await this.core.getAgent();
    const reasoned = await this.reason(signal, risk, context, memory, agent);

    const record: StanceRecord = {
      id: `stance-${Date.now()}`,
      at: new Date().toISOString(),
      stance: reasoned.stance,
      conviction: reasoned.conviction,
      rationale: reasoned.rationale,
      epoch: signal.epoch,
      riskLabel: risk.label,
    };

    const { root, proof } = OobeReasoner.merkleProof([...memory, record], record);
    this.saveMemory([...memory, record]);

    const inscriptionSignature = agent ? await this.inscribeOnChain(agent, record) : undefined;
    receipt.record({
      kind: "oobe-reasoning",
      description: `stance "${record.stance}" (conviction ${
        record.conviction
      }) merkleRoot=${root.slice(0, 16)}… via ${reasoned.provider}`,
      signature: inscriptionSignature,
      simulated: !inscriptionSignature,
    });
    this.log.info(
      `stance=${record.stance} conviction=${record.conviction} merkleRoot=${root.slice(
        0,
        16,
      )}… memoryDepth=${memory.length}`,
    );

    return {
      ...record,
      provider: reasoned.provider,
      merkleRoot: root,
      merkleProof: proof,
      memoryDepth: memory.length,
      inscriptionSignature,
    };
  }

  private async reason(
    signal: MarketSignal,
    risk: RiskAssessment,
    context: string,
    memory: StanceRecord[],
    agent: OobeAgent | null,
  ): Promise<{
    stance: Stance;
    conviction: number;
    rationale: string;
    provider: string;
  }> {
    const fallback = OobeReasoner.heuristic(signal, risk);
    if (!agent) return { ...fallback, provider: "oobe:local-heuristic" };

    const persona = await agent.getDefaultPersonality().catch(() => PERSONA);
    const recent = memory
      .slice(-this.memoryDepth)
      .map((m) => `- ${m.at}: ${m.stance} (${m.conviction}) — ${m.rationale}`)
      .join("\n");
    const prompt =
      `You are ${PERSONA.name}, ${PERSONA.role}. Personality: ${JSON.stringify(persona)}.\n${
        PERSONA.mandate
      }\n\n` +
      `PRIOR STANCES:\n${recent || "(none)"}\n\nSIGNAL:\n${JSON.stringify(signal)}\n\n` +
      `SENTINEL RISK: ${risk.label} ${risk.score}/100 — ${
        risk.rationale
      }\n\nCONTEXT:\n${context.slice(0, 800)}\n\n` +
      `Reply with ONLY JSON: {"stance":"accumulate|neutral|cautious|defensive","conviction":0-100,"rationale":"<=40 words"}`;

    try {
      const res = await agent.genAi().invoke(prompt);
      const parsed = OobeReasoner.parse(OobeCoreProvider.contentToString(res.content), fallback);
      return { ...parsed, provider: this.core.providerLabel };
    } catch (err) {
      this.log.warn("OobeCore reasoning failed; using heuristic", (err as Error).message);
      return { ...fallback, provider: "oobe:local-heuristic(fallback)" };
    }
  }

  /** Validate + inscribe the decision on-chain via the OOBE agent's Merkle. */
  private async inscribeOnChain(
    agent: OobeAgent,
    record: StanceRecord,
  ): Promise<string | undefined> {
    try {
      const validated = agent.merkleValidate(
        [{ name: "decide_stance", content: JSON.stringify(record) }],
        record as unknown as Record<string, unknown>,
      );
      const sig = await agent.merkle.onChainMerkleInscription(validated);
      this.log.info(`stance inscribed on-chain: ${String(sig)}`);
      return typeof sig === "string" ? sig : (sig as any)?.signature;
    } catch (err) {
      this.log.warn("on-chain merkle inscription failed", (err as Error).message);
      return undefined;
    }
  }

  /** One Merkle tree over the full history yields a consistent root + proof. */
  private static merkleProof(
    history: StanceRecord[],
    record: StanceRecord,
  ): { root: string; proof: string[] } {
    try {
      const merkle = new MerkleTreeManager({} as never);
      const root: string = merkle.createMerkle(history.map((r) => JSON.stringify(r))) ?? "";
      const proof = (merkle.getProof(JSON.stringify(record)) ?? []) as string[];
      return { root, proof };
    } catch {
      return { root: "", proof: [] };
    }
  }

  private loadMemory(): StanceRecord[] {
    try {
      return JSON.parse(readFileSync(this.memoryFile, "utf8")) as StanceRecord[];
    } catch {
      return [];
    }
  }

  private saveMemory(records: StanceRecord[]): void {
    const dir = join(process.cwd(), "out");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.memoryFile, JSON.stringify(records.slice(-this.memoryDepth * 4), null, 2));
  }

  private static heuristic(
    signal: MarketSignal,
    risk: RiskAssessment,
  ): { stance: Stance; conviction: number; rationale: string } {
    let stance: Stance = "neutral";
    if (risk.score >= 75) stance = "defensive";
    else if (risk.score >= 50) stance = "cautious";
    else if (risk.score < 25 && signal.tps > 2500) stance = "accumulate";
    const conviction = Math.max(40, Math.min(90, 100 - risk.score + (signal.tps > 2500 ? 10 : 0)));
    return {
      stance,
      conviction,
      rationale: `Risk ${risk.label} (${risk.score}/100), ~${signal.tps} TPS, epoch ${signal.epoch}. ${risk.rationale}`,
    };
  }

  private static parse(
    text: string,
    fallback: { stance: Stance; conviction: number; rationale: string },
  ) {
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]);
        const stance = (["accumulate", "neutral", "cautious", "defensive"] as const).includes(
          j.stance,
        )
          ? (j.stance as Stance)
          : fallback.stance;
        const conviction = Number.isFinite(j.conviction)
          ? Math.max(0, Math.min(100, Number(j.conviction)))
          : fallback.conviction;
        return {
          stance,
          conviction,
          rationale: String(j.rationale ?? fallback.rationale),
        };
      }
    } catch {
      /* fall through */
    }
    return fallback;
  }
}
