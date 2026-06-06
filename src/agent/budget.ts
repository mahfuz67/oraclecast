import { Config } from "../core/config.js";

export type Asset = "lamports" | "usdc";

/** Per-run spending guardrail: hard SOL/USDC caps, a tool allowlist, and a max
 *  step count. A tool that would breach a cap is refused before any spend. */
export class Budget {
  readonly spent: Record<Asset, bigint> = { lamports: 0n, usdc: 0n };
  readonly caps: Record<Asset, bigint>;
  readonly maxSteps: number;
  private readonly allow: Set<string> | null;

  constructor(config: Config = Config.get()) {
    this.caps = {
      lamports: config.env.RUN_BUDGET_LAMPORTS,
      usdc: config.env.RUN_BUDGET_USDC,
    };
    this.maxSteps = config.env.AGENT_MAX_STEPS;
    const list = config.env.AGENT_TOOL_ALLOWLIST?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.allow = list && list.length ? new Set(list) : null;
  }

  isAllowed(tool: string): boolean {
    return this.allow ? this.allow.has(tool) : true;
  }

  canSpend(asset: Asset, amount: bigint): { ok: boolean; reason?: string } {
    if (this.spent[asset] + amount > this.caps[asset]) {
      return {
        ok: false,
        reason: `${asset} budget exceeded: spent ${this.spent[asset]} + ${amount} > cap ${this.caps[asset]}`,
      };
    }
    return { ok: true };
  }

  record(asset: Asset, amount: bigint): void {
    this.spent[asset] += amount;
  }

  summary(): Record<string, string> {
    return {
      lamports: `${this.spent.lamports}/${this.caps.lamports}`,
      usdc: `${this.spent.usdc}/${this.caps.usdc}`,
    };
  }
}
