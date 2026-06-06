import { Config } from "../core/config.js";
import type { AceService } from "../services/ace.service.js";
import type { SynapseService } from "../services/synapse.service.js";
import type { SapService } from "../services/sap.service.js";
import type { OobeReasoner } from "../reasoning/oobe.reasoner.js";
import { AgentTool, type ToolContext, type ToolCost } from "./tool.js";

const usdc = (n: bigint): ToolCost => ({ asset: "usdc", amount: n });

export class SenseTool extends AgentTool {
  readonly name = "sense_market";
  readonly description =
    "Read live Solana network + on-chain activity via Synapse RPC. Run this first.";
  readonly args = "{}";
  constructor(private readonly synapse: SynapseService) {
    super();
  }
  async execute(_args: Record<string, unknown>, { state }: ToolContext): Promise<string> {
    state.signal = await this.synapse.senseMarket();
    return `signal captured: ${state.signal.headline}`;
  }
}

export class SearchTool extends AgentTool {
  readonly name = "web_search";
  readonly description =
    "Fetch web context for the current market via Ace Data Cloud search (x402-paid).";
  readonly args = '{ "query"?: string }';
  constructor(private readonly ace: AceService) {
    super();
  }
  cost(): ToolCost {
    return usdc(5_000n);
  }
  async execute(args: Record<string, unknown>, { state, receipt }: ToolContext): Promise<string> {
    const query = String(args.query ?? state.signal?.headline ?? "Solana network");
    state.context = await this.ace.searchContext(query, receipt);
    return `context fetched (${state.context.length} chars)`;
  }
}

export class SentinelRiskTool extends AgentTool {
  readonly name = "risk_check_sentinel";
  readonly description =
    "Consume the Synapse Sentinel agent (funds an on-chain escrow) for a risk score. Requires sense_market.";
  readonly args = "{}";
  constructor(private readonly sap: SapService) {
    super();
  }
  cost(): ToolCost {
    return { asset: "lamports", amount: 1_000_000n };
  }
  async execute(_args: Record<string, unknown>, { state, receipt }: ToolContext): Promise<string> {
    if (!state.signal) return "error: call sense_market before risk_check_sentinel";
    state.risk = await this.sap.assessWithSentinel(state.signal, receipt);
    return `risk: ${state.risk.label} (${state.risk.score}/100) via ${state.risk.source}`;
  }
}

export class StanceTool extends AgentTool {
  readonly name = "decide_stance";
  readonly description =
    "Use the OOBE reasoning core to decide a Merkle-proofed stance from signal + risk + context. Requires sense_market and risk_check_sentinel.";
  readonly args = "{}";
  constructor(private readonly oobe: OobeReasoner) {
    super();
  }
  async execute(_args: Record<string, unknown>, { state, receipt }: ToolContext): Promise<string> {
    if (!state.signal || !state.risk)
      return "error: need sense_market and risk_check_sentinel first";
    state.stance = await this.oobe.decideStance(
      state.signal,
      state.risk,
      state.context ?? "",
      receipt,
    );
    return `stance: ${state.stance.stance} (conviction ${state.stance.conviction}, merkleRoot ${state.stance.merkleRoot.slice(0, 12)}…)`;
  }
}

export class AnalysisTool extends AgentTool {
  readonly name = "write_analysis";
  readonly description =
    "Generate the written market briefing via Ace Data Cloud chat (x402-paid). Requires sense_market.";
  readonly args = "{}";
  constructor(private readonly ace: AceService) {
    super();
  }
  cost(): ToolCost {
    return usdc(10_000n);
  }
  async execute(_args: Record<string, unknown>, { state, receipt }: ToolContext): Promise<string> {
    if (!state.signal) return "error: call sense_market first";
    const question =
      `You are OracleCast, an autonomous Solana market analyst. Using the signal and context below, ` +
      `write a punchy ~150-word briefing with a bold one-line title on the first line prefixed "TITLE: ".\n\n` +
      `SIGNAL:\n${JSON.stringify(state.signal)}\n\nCONTEXT:\n${(state.context ?? "").slice(0, 1500)}`;
    state.analysis = await this.ace.writeAnalysis(
      question,
      `Solana Pulse — Epoch ${state.signal.epoch}`,
      receipt,
    );
    return `analysis written: "${state.analysis.title}"`;
  }
}

export class InfographicTool extends AgentTool {
  readonly name = "make_infographic";
  readonly description =
    "Generate a briefing cover infographic via Ace Data Cloud images (x402-paid).";
  readonly args = '{ "prompt"?: string }';
  constructor(private readonly ace: AceService) {
    super();
  }
  cost(): ToolCost {
    return usdc(50_000n);
  }
  async execute(args: Record<string, unknown>, { state, receipt }: ToolContext): Promise<string> {
    const prompt =
      String(args.prompt ?? "") ||
      `Clean dark-theme financial infographic for "${state.analysis?.title ?? "Solana market briefing"}". No text artifacts.`;
    state.imageUrl = await this.ace.makeImage(prompt, receipt);
    return `infographic generated${state.imageUrl ? `: ${state.imageUrl}` : " (artifact)"}`;
  }
}

export class AudioTool extends AgentTool {
  readonly name = "make_audio";
  readonly description =
    "Generate a narrated/scored audio briefing via Ace Data Cloud audio/Suno (x402-paid).";
  readonly args = '{ "prompt"?: string }';
  constructor(private readonly ace: AceService) {
    super();
  }
  cost(): ToolCost {
    return usdc(100_000n);
  }
  async execute(args: Record<string, unknown>, { state, receipt }: ToolContext): Promise<string> {
    const prompt =
      String(args.prompt ?? "") ||
      `A short ${state.risk?.label ?? "measured"}-energy ambient news-briefing track titled "${state.analysis?.title ?? "Solana Pulse"}".`;
    state.audioUrl = await this.ace.makeAudio(prompt, receipt);
    return `audio generated${state.audioUrl ? `: ${state.audioUrl}` : " (artifact)"}`;
  }
}

export class SettleTool extends AgentTool {
  readonly name = "settle_payment";
  readonly description =
    "Settle one call on a subscriber's on-chain escrow (sell-side Category-1 volume). No-op if no subscriber is configured.";
  readonly args = "{}";
  constructor(
    private readonly sap: SapService,
    private readonly config: Config,
  ) {
    super();
  }
  cost(): ToolCost {
    return { asset: "lamports", amount: this.config.env.PRICE_PER_CALL };
  }
  async execute(
    _args: Record<string, unknown>,
    { state, receipt, briefingId }: ToolContext,
  ): Promise<string> {
    state.settlement = await this.sap.settleSubscriber(briefingId, receipt);
    return state.settlement.settled
      ? `settled${state.settlement.signature ? ` tx=${state.settlement.signature}` : ""}`
      : `not settled: ${state.settlement.reason}`;
  }
}
