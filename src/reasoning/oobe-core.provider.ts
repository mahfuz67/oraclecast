import bs58 from "bs58";
import { OobeCore, ConfigManager } from "oobe-protocol";
import { Config } from "../core/config.js";
import { Solana } from "../core/solana.js";
import { Logger } from "../core/logger.js";

export interface ChatModel {
  invoke(input: string): Promise<{ content: unknown }>;
}

/** Minimal view of the OOBE `Agent` (the methods OracleCast uses). */
export interface OobeAgent {
  walletAddress: string;
  genAi(): ChatModel;
  getDefaultPersonality(): Promise<unknown>;
  merkleValidate(input: unknown[], result: Record<string, unknown>): unknown;
  merkle: {
    onChainMerkleInscription(data: unknown): Promise<unknown>;
    getMerkleRoot(): string | null;
  };
}

/**
 * Builds and starts an OOBE `OobeCore` per the documented pattern
 * (`new OobeCore(config)` → `start()` → `getAgent()`) and exposes the started
 * agent + its chat model. Returns null in DRY_RUN / without an OpenAI key,
 * since starting OobeCore performs live LLM and on-chain persona work.
 */
export class OobeCoreProvider {
  private readonly log = new Logger("oobe:core");
  private core: OobeCore | null = null;
  private agent: OobeAgent | null = null;
  private resolved = false;

  constructor(
    private readonly config: Config,
    private readonly solana: Solana,
  ) {}

  async getAgent(): Promise<OobeAgent | null> {
    if (this.resolved) return this.agent;
    this.resolved = true;

    if (this.config.dryRun || !this.config.env.OPENAI_API_KEY) {
      this.log.info("OobeCore disabled (DRY_RUN or no OPENAI_API_KEY).");
      return null;
    }
    try {
      const config = new ConfigManager().createDefaultConfig(
        bs58.encode(this.solana.keypair.secretKey),
        this.config.env.OPENAI_API_KEY,
        this.config.env.OOBE_KEY ?? "",
        { rpc: this.config.rpcUrl },
      );
      this.core = new OobeCore(config);
      await this.core.start();
      this.agent = this.core.getAgent() as unknown as OobeAgent;
      this.log.info(`OobeCore started; agent wallet ${this.agent.walletAddress}`);
      return this.agent;
    } catch (err) {
      this.log.warn("OobeCore init failed; using heuristics", (err as Error).message);
      this.agent = null;
      return null;
    }
  }

  async getModel(): Promise<ChatModel | null> {
    const agent = await this.getAgent();
    return agent ? agent.genAi() : null;
  }

  get providerLabel(): string {
    return `oobe:OobeCore:${this.config.env.OOBE_LLM_MODEL}`;
  }

  static contentToString(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((p) =>
          typeof p === "string" ? p : typeof (p as any)?.text === "string" ? (p as any).text : "",
        )
        .join("");
    }
    return String(content ?? "");
  }
}
