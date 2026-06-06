import type { Receipt } from "../core/receipt.js";
import type { Asset } from "./budget.js";
import type { MarketSignal } from "../services/synapse.service.js";
import type { Analysis } from "../services/ace.service.js";
import type { RiskAssessment, SettleResult } from "../services/sap.service.js";
import type { OracleStance } from "../reasoning/oobe.reasoner.js";

/** Mutable state accumulated across tool calls within a single briefing run. */
export interface RunState {
  signal?: MarketSignal;
  context?: string;
  risk?: RiskAssessment;
  stance?: OracleStance;
  analysis?: Analysis;
  imageUrl?: string;
  audioUrl?: string;
  settlement?: SettleResult;
  finalTitle?: string;
}

export interface ToolContext {
  state: RunState;
  receipt: Receipt;
  briefingId: string;
}

export type ToolCost = { asset: Asset; amount: bigint };

/** A capability the agent can choose to invoke. Subclasses declare an
 *  estimated cost (for budget gating) and implement `execute`. */
export abstract class AgentTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly args: string;

  cost(): ToolCost | null {
    return null;
  }

  abstract execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}
