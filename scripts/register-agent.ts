import { OracleCast } from "../src/oracle-cast.js";
import { Receipt } from "../src/core/receipt.js";
import { Logger } from "../src/core/logger.js";

const log = new Logger("script:register");

new OracleCast().sap
  .register(new Receipt())
  .then((agent) => log.info(`agent ${agent}`))
  .catch((e: Error) => {
    log.error("failed", e.stack ?? e.message);
    process.exit(1);
  });
