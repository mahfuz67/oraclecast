import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Config } from "../core/config.js";
import { Logger } from "../core/logger.js";
import { Receipt } from "../core/receipt.js";
import type { SynapseService, MarketSignal } from "../services/synapse.service.js";
import type { SapService, RiskAssessment, SettleResult } from "../services/sap.service.js";
import type { OobeReasoner, OracleStance } from "../reasoning/oobe.reasoner.js";
import type { OracleAgent } from "../agent/oracle-agent.js";
import type { RunState } from "../agent/tool.js";

export interface Briefing {
  id: string;
  title: string;
  body: string;
  signal: MarketSignal;
  risk: RiskAssessment;
  stance: OracleStance;
  outlook?: string;
  imageUrl?: string;
  audioUrl?: string;
  agent: string;
  settlement: SettleResult;
  driver: "llm" | "planner";
  steps: number;
  budget: Record<string, string>;
  outputDir?: string;
}

export interface BriefingRunResult {
  briefing: Briefing;
  receipt: ReturnType<Receipt["toJSON"]>;
}

/** Orchestrates one autonomous run: register identity → drive the agent loop →
 *  guarantee a complete briefing → persist the bundle and receipt. */
export class BriefingService {
  private readonly log = new Logger("briefing");

  constructor(
    private readonly config: Config,
    private readonly synapse: SynapseService,
    private readonly sap: SapService,
    private readonly oobe: OobeReasoner,
    private readonly agent: OracleAgent,
  ) {}

  async run(): Promise<BriefingRunResult> {
    const id = `oraclecast-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const receipt = new Receipt();
    receipt.meta = {
      id,
      dryRun: this.config.dryRun,
      agentName: this.config.env.AGENT_NAME,
    };
    this.log.info(`=== run ${id} (DRY_RUN=${this.config.dryRun}) ===`);

    const agentPda = await this.sap.register(receipt);
    const { state, steps, driver, budget } = await this.agent.run(id, receipt);
    const { signal, risk, stance } = await this.ensureComplete(state, receipt);

    const briefing: Briefing = {
      id,
      title: state.analysis!.title,
      body: state.analysis!.body,
      signal,
      risk,
      stance,
      outlook: state.outlook,
      imageUrl: state.imageUrl,
      audioUrl: state.audioUrl,
      agent: agentPda,
      settlement: state.settlement ?? {
        settled: false,
        reason: "not attempted",
      },
      driver,
      steps,
      budget,
    };
    briefing.outputDir = await this.deliver(briefing, receipt);

    this.log.info(
      `=== done ${id} (driver=${driver}, steps=${steps}, budget=${JSON.stringify(budget)}); ` +
        `payments=${receipt.payments.length}, totals=${JSON.stringify(receipt.totals())} ===`,
    );
    return { briefing, receipt: receipt.toJSON() };
  }

  /** Fill any essentials the agent skipped, using cheap non-paid fallbacks. */
  private async ensureComplete(
    state: RunState,
    receipt: Receipt,
  ): Promise<{
    signal: MarketSignal;
    risk: RiskAssessment;
    stance: OracleStance;
  }> {
    if (!state.signal) {
      this.log.warn("agent did not sense; filling signal (read-only).");
      state.signal = await this.synapse.senseMarket();
    }
    const signal = state.signal;
    const risk: RiskAssessment = state.risk ?? {
      score: 50,
      label: "moderate",
      rationale: "(Sentinel not consulted)",
      source: "sentinel-escrow+local",
    };
    const stance =
      state.stance ?? (await this.oobe.decideStance(signal, risk, state.context ?? "", receipt));
    state.analysis ??= {
      title: `Solana Pulse — Epoch ${signal.epoch}`,
      body: signal.headline,
    };
    return { signal, risk, stance };
  }

  private async deliver(b: Briefing, receipt: Receipt): Promise<string> {
    const dir = join(process.cwd(), "out", b.id);
    await mkdir(dir, { recursive: true });

    const mdPath = join(dir, "briefing.md");
    await writeFile(mdPath, BriefingService.markdown(b), "utf8");
    receipt.addArtifact("briefing.md", mdPath);

    if (b.imageUrl && (await BriefingService.download(b.imageUrl, join(dir, "cover.png")))) {
      receipt.addArtifact("cover", join(dir, "cover.png"));
    }
    if (b.audioUrl && (await BriefingService.download(b.audioUrl, join(dir, "briefing.mp3")))) {
      receipt.addArtifact("audio", join(dir, "briefing.mp3"));
    }

    await writeFile(join(dir, "receipt.json"), JSON.stringify(receipt.toJSON(), null, 2), "utf8");
    this.log.info(`delivered -> ${dir}`);
    return dir;
  }

  private static async download(url: string, dest: string): Promise<boolean> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) return false;
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return true;
    } catch {
      return false;
    }
  }

  private static markdown(b: Briefing): string {
    return `# ${b.title}

> OracleCast autonomous briefing · ${b.signal.capturedAt}
> Risk: **${b.risk.label.toUpperCase()}** (${b.risk.score}/100) — ${b.risk.rationale}
> Stance: **${b.stance.stance.toUpperCase()}** (conviction ${b.stance.conviction}/100)

## OracleCast stance (OOBE reasoning core)

**${b.stance.stance.toUpperCase()}** — ${b.stance.rationale}

- Reasoning engine: \`${b.stance.provider}\`
- Memory depth: ${b.stance.memoryDepth} prior briefing(s)
- Merkle root: \`${b.stance.merkleRoot}\`
- Merkle proof: ${b.stance.merkleProof.length} node(s) — verifiable decision history

## Market analysis

${b.body}
${b.outlook ? `\n## Outlook (GLM)\n\n${b.outlook}\n` : ""}
## On-chain signal

- Slot: ${b.signal.slot}
- Epoch: ${b.signal.epoch} (${b.signal.epochProgressPct}% complete)
- Throughput: ~${b.signal.tps} TPS
- Circulating SOL: ${b.signal.circulatingSol.toLocaleString()}

### Watched venues
${b.signal.watched.map((w) => `- **${w.label}**: ${w.recentTxns} recent txns`).join("\n")}

## Media
- Infographic: ${b.imageUrl ?? "(artifact / dry-run)"}
- Audio briefing: ${b.audioUrl ?? "(artifact / dry-run)"}

---
_Generated autonomously by OracleCast (${b.driver}-driven, ${
      b.steps
    } agent steps, budget ${JSON.stringify(
      b.budget,
    )}). Tools discovered via SAP; media via Ace Data Cloud (x402); risk via Synapse Sentinel; reasoning via OOBE; payments settled on Solana._
`;
  }
}
