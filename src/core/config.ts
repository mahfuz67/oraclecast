import "dotenv/config";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === "1" || v.toLowerCase() === "true"));

const Schema = z.object({
  DRY_RUN: bool(true),

  SYNAPSE_RPC_URL: z.string().optional(),
  SOLANA_RPC_URL: z.string().default("https://api.mainnet-beta.solana.com"),
  TX_RPC_URL: z.string().optional(),

  WALLET_PATH: z.string().default("./wallet.json"),
  WALLET_SECRET_KEY: z.string().optional(),

  ACE_BASE_URL: z.string().default("https://api.acedata.cloud"),
  ACE_API_TOKEN: z.string().optional(),
  ACE_PAYMENT_NETWORK: z.enum(["solana", "base", "skale"]).default("solana"),

  SENTINEL_AGENT: z.string().default("Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph"),

  OPENAI_API_KEY: z.string().optional(),
  OOBE_KEY: z.string().optional(),
  OOBE_LLM_PROVIDER: z
    .enum(["openai", "groq", "mistral", "ollama", "together", "xai", "fireworks"])
    .default("openai"),
  OOBE_LLM_MODEL: z.string().default("gpt-4o-mini"),

  AGENT_MAX_STEPS: z.coerce.number().int().positive().default(12),
  RUN_BUDGET_LAMPORTS: z.coerce.bigint().default(5_000_000n),
  RUN_BUDGET_USDC: z.coerce.bigint().default(500_000n),
  AGENT_TOOL_ALLOWLIST: z.string().optional(),

  AGENT_NAME: z.string().default("OracleCast"),
  AGENT_DESCRIPTION: z.string().default("Autonomous on-chain multimedia market-briefing agent."),
  AGENT_URI: z.string().optional(),
  AGENT_X402_ENDPOINT: z.string().optional(),

  SUBSCRIBER_PUBKEY: z.string().optional(),
  SUBSCRIBER_ESCROW_NONCE: z.coerce.bigint().default(0n),
  PRICE_PER_CALL: z.coerce.bigint().default(1_000_000n),

  BRIEFING_CRON: z.string().default("*/30 * * * *"),
  PORT: z.coerce.number().default(8787),
});

export type Env = z.infer<typeof Schema>;

/** Validated, immutable runtime configuration (process-wide singleton). */
export class Config {
  private static _instance: Config | null = null;
  readonly env: Env;
  /** Synapse RPC for the read/sense side of execution. */
  readonly rpcUrl: string;
  /** RPC for submitting transactions (defaults to a synced public RPC, since
   *  the free-tier Synapse node can lag and hand out expired blockhashes). */
  readonly txRpcUrl: string;

  private constructor() {
    this.env = Schema.parse(process.env);
    this.rpcUrl = this.env.SYNAPSE_RPC_URL?.trim() || this.env.SOLANA_RPC_URL;
    this.txRpcUrl = this.env.TX_RPC_URL?.trim() || this.env.SOLANA_RPC_URL;
  }

  static get(): Config {
    return (Config._instance ??= new Config());
  }

  get dryRun(): boolean {
    return this.env.DRY_RUN;
  }
}
