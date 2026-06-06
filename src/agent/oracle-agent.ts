import { Logger } from "../core/logger.js";
import type { Receipt } from "../core/receipt.js";
import { OobeCoreProvider } from "../reasoning/oobe-core.provider.js";
import { Budget } from "./budget.js";
import { AgentTool, type RunState, type ToolContext } from "./tool.js";

const GOAL =
  "Produce a complete, trustworthy multimedia Solana market briefing: sense the chain, gather " +
  "context, get a Sentinel risk check, decide an OOBE stance, write the analysis, create an " +
  "infographic and an audio briefing, then settle payment and finish. Call each tool at most " +
  "once. Stay within budget. When the briefing is complete, finish.";

export interface AgentResult {
  state: RunState;
  steps: number;
  driver: "llm" | "planner";
  budget: Record<string, string>;
}

interface Action {
  action: string;
  args?: Record<string, unknown>;
}

/**
 * The autonomous ReAct loop. When an OOBE LLM is available it decides the next
 * tool each step (reason → act → observe); otherwise a deterministic planner
 * walks the tools in order. Every step is gated by the Budget.
 */
export class OracleAgent {
  private readonly log = new Logger("agent");
  private readonly tools: Map<string, AgentTool>;
  private readonly order: string[];

  constructor(
    tools: AgentTool[],
    private readonly core: OobeCoreProvider,
  ) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
    this.order = tools.map((t) => t.name);
  }

  async run(briefingId: string, receipt: Receipt): Promise<AgentResult> {
    const model = await this.core.getModel();
    const budget = new Budget();
    const state: RunState = {};
    const ctx: ToolContext = { state, receipt, briefingId };
    const called = new Set<string>();
    const driver: "llm" | "planner" = model ? "llm" : "planner";

    this.log.info(`loop start (driver=${driver}, maxSteps=${budget.maxSteps})`);
    let transcript = `${this.systemPrompt(budget)}\n\nBegin. Reply with your first action.`;
    let steps = 0;

    for (; steps < budget.maxSteps; steps++) {
      let action: Action | null;
      if (model) {
        const res = await model.invoke(transcript).catch((e: Error) => {
          this.log.warn("model.invoke failed; planning deterministically", e.message);
          return null;
        });
        action = res
          ? OracleAgent.parseAction(OobeCoreProvider.contentToString(res.content))
          : null;
        if (!action) {
          transcript += `\nOBSERVATION: could not parse an action; reply with one JSON object.`;
          continue;
        }
      } else {
        action = this.planNext(state, called);
      }

      this.log.info(`step ${steps + 1}: action=${action.action}`);

      if (action.action === "finish") {
        state.finalTitle = (action.args?.title as string) ?? state.analysis?.title;
        break;
      }

      const observation = await this.invokeTool(action, ctx, budget, called);
      this.log.info(`  -> ${observation}`);
      transcript += `\nACTION: ${JSON.stringify(action)}\nOBSERVATION: ${observation}`;

      if (!model && called.size >= this.tools.size) {
        state.finalTitle = state.analysis?.title;
        steps++;
        break;
      }
    }

    this.log.info(
      `loop done (${steps} steps, driver=${driver}, budget=${JSON.stringify(budget.summary())})`,
    );
    return { state, steps, driver, budget: budget.summary() };
  }

  private async invokeTool(
    action: Action,
    ctx: ToolContext,
    budget: Budget,
    called: Set<string>,
  ): Promise<string> {
    const tool = this.tools.get(action.action);
    if (!tool) return `error: unknown tool "${action.action}"`;

    called.add(tool.name);
    if (!budget.isAllowed(tool.name)) return `refused: tool "${tool.name}" is not on the allowlist`;

    const cost = tool.cost();
    if (cost) {
      const gate = budget.canSpend(cost.asset, cost.amount);
      if (!gate.ok) return `refused: ${gate.reason}`;
    }
    try {
      const observation = await tool.execute(action.args ?? {}, ctx);
      const failed = observation.startsWith("error") || observation.startsWith("not settled");
      if (cost && !failed) budget.record(cost.asset, cost.amount);
      return observation;
    } catch (err) {
      return `error: ${(err as Error).message}`;
    }
  }

  private planNext(state: RunState, called: Set<string>): Action {
    for (const name of this.order) if (!called.has(name)) return { action: name, args: {} };
    return { action: "finish", args: { title: state.analysis?.title } };
  }

  private systemPrompt(budget: Budget): string {
    const tools = [...this.tools.values()]
      .map((t) => `  - ${t.name} ${t.args} — ${t.description}`)
      .join("\n");
    return (
      `You are OracleCast, an autonomous on-chain market-intelligence agent.\n` +
      `GOAL: ${GOAL}\n\nTOOLS:\n${tools}\n  - finish { "title"?: string } — end the run.\n\n` +
      `BUDGET (hard caps, base units): lamports=${budget.caps.lamports}, usdc=${budget.caps.usdc}.\n\n` +
      `Respond with EXACTLY ONE JSON object: {"action":"<tool_name|finish>","args":{...}}`
    );
  }

  private static parseAction(text: string): Action | null {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const j = JSON.parse(m[0]);
      if (typeof j.action === "string") return { action: j.action, args: j.args ?? {} };
    } catch {
      /* ignore */
    }
    return null;
  }
}
