import { Config } from "./core/config.js";
import { Solana } from "./core/solana.js";
import { SynapseService } from "./services/synapse.service.js";
import { AceService } from "./services/ace.service.js";
import { SapService } from "./services/sap.service.js";
import { OobeCoreProvider } from "./reasoning/oobe-core.provider.js";
import { OobeReasoner } from "./reasoning/oobe.reasoner.js";
import { OracleAgent } from "./agent/oracle-agent.js";
import {
  SenseTool,
  SearchTool,
  SentinelRiskTool,
  StanceTool,
  AnalysisTool,
  InfographicTool,
  AudioTool,
  SettleTool,
} from "./agent/tools.js";
import { BriefingService } from "./pipeline/briefing.service.js";

/** Composition root: constructs and wires every service, tool, and the agent. */
export class OracleCast {
  readonly config: Config;
  readonly solana: Solana;
  readonly synapse: SynapseService;
  readonly ace: AceService;
  readonly sap: SapService;
  readonly core: OobeCoreProvider;
  readonly oobe: OobeReasoner;
  readonly agent: OracleAgent;
  readonly briefing: BriefingService;

  constructor() {
    this.config = Config.get();
    this.solana = new Solana(this.config);
    this.synapse = new SynapseService(this.config);
    this.ace = new AceService(this.config, this.solana);
    this.sap = new SapService(this.config, this.solana);
    this.core = new OobeCoreProvider(this.config, this.solana);
    this.oobe = new OobeReasoner(this.core);

    const tools = [
      new SenseTool(this.synapse),
      new SearchTool(this.ace),
      new SentinelRiskTool(this.sap),
      new StanceTool(this.oobe),
      new AnalysisTool(this.ace),
      new InfographicTool(this.ace),
      new AudioTool(this.ace),
      new SettleTool(this.sap, this.config),
    ];
    this.agent = new OracleAgent(tools, this.core);
    this.briefing = new BriefingService(this.config, this.synapse, this.sap, this.oobe, this.agent);
  }
}
