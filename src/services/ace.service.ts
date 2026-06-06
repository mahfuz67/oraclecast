import { AceDataCloud } from "@acedatacloud/sdk";
import { createX402PaymentHandler } from "@acedatacloud/x402-client";
import { Config } from "../core/config.js";
import { Logger } from "../core/logger.js";
import { Solana } from "../core/solana.js";
import type { Receipt } from "../core/receipt.js";

export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** DRY_RUN per-service USDC estimates (base units; USDC has 6 decimals). */
const ESTIMATE = { chat: "10000", image: "50000", audio: "100000", search: "5000" } as const;

type Rec = Record<string, unknown>;

export interface Analysis {
  title: string;
  body: string;
}

/** Wraps the Ace Data Cloud SDK, paying per request via the x402 facilitator
 *  on Solana. Each service is a distinct Ace capability (chat/search/image/audio). */
export class AceService {
  private client: AceDataCloud | null = null;
  private readonly log = new Logger("ace");

  constructor(
    private readonly config: Config,
    private readonly solana: Solana,
  ) {}

  /** Lazily builds the SDK client with the x402 payment handler; payments are
   *  recorded into the active receipt as the server advertises them. */
  private sdk(receipt: Receipt): AceDataCloud {
    if (this.client) return this.client;
    const network = this.config.env.ACE_PAYMENT_NETWORK;
    const inner = createX402PaymentHandler({
      network,
      solanaWallet: this.solana.x402Adapter(),
      preferScheme: "exact",
    });
    const paymentHandler = async (ctx: any) => {
      const accept =
        (ctx.accepts ?? []).find((a: any) => a.network === network) ?? ctx.accepts?.[0];
      this.log.info(`402 ${ctx.url} -> ${accept?.maxAmountRequired} ${accept?.asset} (${network})`);
      const res = await inner(ctx);
      receipt.record({
        kind: "ace-x402",
        description: `x402 settle ${ctx.url}`,
        amount: accept?.maxAmountRequired,
        asset: accept?.asset,
        simulated: false,
      });
      return res;
    };
    this.client = new AceDataCloud({
      baseURL: this.config.env.ACE_BASE_URL,
      apiToken: this.config.env.ACE_API_TOKEN || undefined,
      paymentHandler,
    });
    return this.client;
  }

  private simulate(receipt: Receipt, service: keyof typeof ESTIMATE, description: string): void {
    receipt.record({
      kind: "ace-x402",
      description: `${description} — simulated`,
      amount: ESTIMATE[service],
      asset: USDC,
      simulated: true,
    });
  }

  private static text(r: Rec): string {
    const choices = (r as any).choices;
    if (Array.isArray(choices) && choices[0]?.message?.content) {
      return String(choices[0].message.content);
    }
    for (const k of ["text", "answer", "content", "response", "output", "result"]) {
      const v = (r as any)[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return JSON.stringify(r).slice(0, 2000);
  }

  private static firstUrl(r: Rec): string | undefined {
    const urls: string[] = [];
    const visit = (v: unknown) => {
      if (typeof v === "string" && /^https?:\/\//.test(v)) urls.push(v);
      else if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") Object.values(v as Rec).forEach(visit);
    };
    visit(r);
    return urls[0];
  }

  async searchContext(query: string, receipt: Receipt): Promise<string> {
    if (this.config.dryRun) {
      this.simulate(receipt, "search", `search.google("${query}")`);
      return `(dry-run context) Stable Solana activity around "${query}".`;
    }
    const res: any = await this.sdk(receipt).search.google({ query });
    const items: any[] = res?.results ?? res?.items ?? res?.organic ?? [];
    return (
      items
        .slice(0, 5)
        .map((it) => `- ${it.title ?? ""}: ${it.snippet ?? it.description ?? ""}`)
        .join("\n") || JSON.stringify(res).slice(0, 1200)
    );
  }

  async writeAnalysis(
    question: string,
    fallbackTitle: string,
    receipt: Receipt,
  ): Promise<Analysis> {
    if (this.config.dryRun) {
      this.simulate(receipt, "chat", "aichat.create (analysis)");
      return { title: fallbackTitle, body: question.slice(0, 280) };
    }
    const res = await this.sdk(receipt).aichat.create({
      model: this.config.env.OOBE_LLM_MODEL,
      question,
    });
    const text = AceService.text(res as Rec);
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    return {
      title: titleMatch ? titleMatch[1].trim() : fallbackTitle,
      body: text.replace(/TITLE:\s*.+\n?/i, "").trim(),
    };
  }

  async makeImage(prompt: string, receipt: Receipt): Promise<string | undefined> {
    if (this.config.dryRun) {
      this.simulate(receipt, "image", "images.generate (infographic)");
      return undefined;
    }
    // wait:false => submit + pay the x402 charge ONCE; do not poll the task
    // endpoint (Ace charges x402 on every poll, which drains the budget).
    const res = await this.sdk(receipt).images.generate({
      prompt,
      provider: "flux",
      size: "1024x1024",
      wait: false,
    });
    return AceService.firstUrl((res as any)?.result ?? res);
  }

  async makeAudio(prompt: string, receipt: Receipt): Promise<string | undefined> {
    if (this.config.dryRun) {
      this.simulate(receipt, "audio", "audio.generate (Suno)");
      return undefined;
    }
    // wait:false => one x402 charge for the submission; never poll suno/tasks
    // (each poll is x402-charged and would drain the budget in a loop).
    const res = await this.sdk(receipt).audio.generate({
      prompt,
      provider: "suno",
      tags: "ambient, news, electronic",
      wait: false,
    });
    return AceService.firstUrl((res as any)?.result ?? res);
  }
}
