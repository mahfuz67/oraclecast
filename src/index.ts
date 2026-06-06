import { OracleCast } from "./oracle-cast.js";
import { Scheduler } from "./runtime/scheduler.js";
import { HttpServer } from "./runtime/server.js";
import { Receipt } from "./core/receipt.js";
import { Logger } from "./core/logger.js";

const log = new Logger("main");

async function main(): Promise<void> {
  const mode = (process.argv[2] ?? "run-once").toLowerCase();
  const app = new OracleCast();
  log.info(`starting "${mode}" (DRY_RUN=${app.config.dryRun}, rpc=${app.config.rpcUrl})`);

  switch (mode) {
    case "run-once": {
      const { briefing } = await app.briefing.run();
      log.info(`briefing "${briefing.title}" -> ${briefing.outputDir}`);
      break;
    }
    case "loop":
      new Scheduler(app.briefing).start();
      break;
    case "serve":
      new HttpServer(app.briefing, app.sap).start();
      break;
    case "register": {
      const agent = await app.sap.register(new Receipt());
      log.info(`agent ${agent}`);
      break;
    }
    default:
      log.error(`unknown mode "${mode}". Use run-once | loop | serve | register.`);
      process.exit(1);
  }
}

main().catch((err) => {
  log.error("fatal", (err as Error).stack ?? (err as Error).message);
  process.exit(1);
});
