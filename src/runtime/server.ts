import { createServer, type ServerResponse } from "node:http";
import { Config } from "../core/config.js";
import { Logger } from "../core/logger.js";
import type { SapService } from "../services/sap.service.js";
import type { BriefingService, BriefingRunResult } from "../pipeline/briefing.service.js";

/** HTTP surface so a counterparty can trigger / fetch briefings. */
export class HttpServer {
  private readonly log = new Logger("server");
  private latest: BriefingRunResult | null = null;
  private busy = false;

  constructor(
    private readonly briefing: BriefingService,
    private readonly sap: SapService,
    private readonly config: Config = Config.get(),
  ) {}

  start(): void {
    const port = this.config.env.PORT;
    createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      try {
        if (req.method === "GET" && url.pathname === "/health") {
          return this.json(res, 200, { ok: true, dryRun: this.config.dryRun });
        }
        if (req.method === "GET" && url.pathname === "/agent") {
          return this.json(res, 200, {
            name: this.config.env.AGENT_NAME,
            agentPda: this.sap.myAgentPda().toBase58(),
            capability: "oracle:briefing",
          });
        }
        if (req.method === "POST" && url.pathname === "/briefings") {
          if (this.busy)
            return this.json(res, 429, { error: "a briefing run is already in progress" });
          this.busy = true;
          try {
            this.latest = await this.briefing.run();
            return this.json(res, 200, this.latest);
          } finally {
            this.busy = false;
          }
        }
        if (req.method === "GET" && url.pathname === "/briefings/latest") {
          return this.latest
            ? this.json(res, 200, this.latest)
            : this.json(res, 404, { error: "no briefing yet" });
        }
        return this.json(res, 404, { error: "not found" });
      } catch (err) {
        this.log.error("request failed", (err as Error).message);
        return this.json(res, 500, { error: (err as Error).message });
      }
    }).listen(port, () => this.log.info(`HTTP on :${port} (DRY_RUN=${this.config.dryRun})`));
  }

  private json(res: ServerResponse, code: number, body: unknown): void {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
  }
}
