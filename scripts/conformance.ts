/* SDK conformance check — run inside the esbuild bundle (same loading as the app). */
import assert from "node:assert";
import { Keypair, Connection } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { AceDataCloud } from "@acedatacloud/sdk";
import { createX402PaymentHandler } from "@acedatacloud/x402-client";
import * as Synapse from "@oobe-protocol-labs/synapse-client-sdk";
import { SapClient, Pdas, SEEDS } from "@oobe-protocol-labs/synapse-sap-sdk";
import { OobeCore, ConfigManager, MerkleTreeManager } from "oobe-protocol";

const { SynapseClient } = Synapse;

let pass = 0;
const ok = (l: string) => {
  console.log("  ✓", l);
  pass++;
};
const isFn = (o: any, k: string) => assert(typeof o?.[k] === "function", `${k} must be a function`);

async function main(): Promise<void> {
  const kp = Keypair.generate();

  console.log("@acedatacloud/sdk");
  const ace = new AceDataCloud({
    baseURL: "https://api.acedata.cloud",
    paymentHandler: async () => ({ headers: {} }),
  });
  isFn(ace.aichat, "create");
  ok("aichat.create");
  isFn(ace.search, "google");
  ok("search.google");
  isFn(ace.images, "generate");
  ok("images.generate");
  isFn(ace.audio, "generate");
  ok("audio.generate");

  console.log("@acedatacloud/x402-client");
  assert(typeof createX402PaymentHandler === "function");
  ok("createX402PaymentHandler");
  const handler = createX402PaymentHandler({
    network: "solana",
    solanaWallet: {
      publicKey: { toBase58: () => "", toString: () => "" },
      signAndSendTransaction: async () => ({ signature: "" }),
    },
  });
  assert(typeof handler === "function");
  ok("handler is callable");

  console.log("@oobe-protocol-labs/synapse-client-sdk");
  const sc = new SynapseClient({ endpoint: "https://api.mainnet-beta.solana.com" });
  for (const m of [
    "getSlot",
    "getEpochInfo",
    "getRecentPerformanceSamples",
    "getSupply",
    "getSignaturesForAddress",
  ]) {
    isFn(sc.rpc, m);
    ok(`rpc.${m}`);
  }

  console.log("@oobe-protocol-labs/synapse-sap-sdk");
  const client = new SapClient({
    connection: new Connection("https://api.mainnet-beta.solana.com"),
    wallet: new Wallet(kp),
  });
  isFn(client.agent, "registerAgent");
  ok("client.agent.registerAgent");
  isFn(client, "buildTransaction");
  ok("client.buildTransaction");
  isFn(client, "sendTransaction");
  ok("client.sendTransaction");
  isFn(client.program.methods, "createEscrowV2");
  ok("program.methods.createEscrowV2");
  isFn(client.program.methods, "settleCallsV2");
  ok("program.methods.settleCallsV2");
  isFn(client.program.methods, "registerAgent");
  ok("program.methods.registerAgent");
  assert((client.program.account as any).agentAccount);
  ok("program.account.agentAccount");
  assert((client.program.account as any).escrowAccountV2);
  ok("program.account.escrowAccountV2");
  for (const f of ["getAgentPDA", "getAgentStatsPDA", "getGlobalPDA", "getAgentStakePDA"]) {
    isFn(Pdas, f);
    ok(`Pdas.${f}`);
  }
  assert(typeof SEEDS.ESCROW_V2 === "string");
  ok("SEEDS.ESCROW_V2");

  console.log("oobe-protocol (documented OobeCore flow)");
  const cm = new ConfigManager();
  isFn(cm, "createDefaultConfig");
  ok("ConfigManager.createDefaultConfig");
  const cfg = cm.createDefaultConfig(bs58.encode(kp.secretKey), "sk-dummy", "", {
    rpc: "https://api.mainnet-beta.solana.com",
  });
  assert(cfg && (cfg as any).private_key);
  ok("createDefaultConfig -> IConfiguration");
  const core = new OobeCore(cfg);
  isFn(core, "start");
  ok("OobeCore.start");
  isFn(core, "getAgent");
  ok("OobeCore.getAgent");
  const agent: any = core.getAgent();
  for (const m of ["genAi", "getDefaultPersonality", "merkleValidate", "initialize"]) {
    isFn(agent, m);
    ok(`agent.${m}`);
  }
  assert(agent.merkle);
  isFn(agent.merkle, "onChainMerkleInscription");
  ok("agent.merkle.onChainMerkleInscription");
  const mt = new MerkleTreeManager({} as never);
  for (const m of ["createMerkle", "getProof", "verifyEvent"]) {
    isFn(mt, m);
    ok(`MerkleTreeManager.${m}`);
  }

  console.log(`\nALL ${pass} SDK CONFORMANCE CHECKS PASSED`);
}

main().catch((e: Error) => {
  console.error("\nCONFORMANCE FAIL:", e.message);
  process.exit(1);
});
