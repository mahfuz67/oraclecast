import cron from "node-cron";
import { Config } from "../core/config.js";
import { Logger } from "../core/logger.js";
import type { BriefingService } from "../pipeline/briefing.service.js";

/** Cron trigger that runs the briefing pipeline on a cadence. Runs are
 *  serialized so a slow run never overlaps the next tick. */
export class Scheduler {
  private readonly log = new Logger("scheduler");
  private running = false;

  constructor(
    private readonly briefing: BriefingService,
    private readonly config: Config = Config.get(),
  ) {}

  start(): void {
    const expr = this.config.env.BRIEFING_CRON;
    if (!cron.validate(expr)) throw new Error(`invalid cron "${expr}"`);
    this.log.info(`armed: "${expr}" (DRY_RUN=${this.config.dryRun}); running first tick now.`);
    void this.tick();
    cron.schedule(expr, () => this.tick());
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.log.warn("previous run still in progress; skipping tick");
      return;
    }
    this.running = true;
    try {
      await this.briefing.run();
    } catch (err) {
      this.log.error("briefing run failed", (err as Error).stack ?? (err as Error).message);
    } finally {
      this.running = false;
    }
  }
}
