import * as Synapse from "@oobe-protocol-labs/synapse-client-sdk";
import { Config } from "../core/config.js";
import { Logger } from "../core/logger.js";

const { SynapseClient } = Synapse;
const pk = (s: string): any => s; // branded address type is a string at runtime

export interface WatchedVenue {
  label: string;
  recentTxns: number;
  lastSignature?: string;
}

export interface MarketSignal {
  slot: number;
  epoch: number;
  epochProgressPct: number;
  tps: number;
  circulatingSol: number;
  watched: WatchedVenue[];
  headline: string;
  capturedAt: string;
}

const WATCHLIST = [
  { label: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { label: "Jupiter v6", address: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" },
  { label: "SAP Program", address: "SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ" },
];

/** Reads live Solana network + on-chain activity via Synapse RPC and distills
 *  it into a compact MarketSignal. Slot/epoch come from Synapse RPC; richer
 *  metrics (TPS, recent activity) fall back to a synced RPC when the Synapse
 *  free-tier node lags or omits those methods. Reads are free. */
export class SynapseService {
  private readonly client: InstanceType<typeof Synapse.SynapseClient>;
  private readonly fallback: InstanceType<typeof Synapse.SynapseClient>;
  private readonly log = new Logger("synapse");

  constructor(config: Config = Config.get()) {
    this.client = new SynapseClient({ endpoint: config.rpcUrl });
    this.fallback = new SynapseClient({ endpoint: config.txRpcUrl });
  }

  async senseMarket(): Promise<MarketSignal> {
    const rpc = this.client.rpc;
    const [slot, epoch] = await Promise.all([
      rpc.getSlot().catch(() => 0),
      rpc.getEpochInfo().catch(() => null as any),
    ]);

    const perf = await this.perfSamples();
    const supply = await this.supply();

    let tps = 0;
    if (Array.isArray(perf) && perf.length) {
      const s = perf[0];
      const numTx = Number(s.numTransactions ?? s.num_transactions ?? 0);
      const secs = Number(s.samplePeriodSecs ?? s.sample_period_secs ?? 60);
      tps = secs > 0 ? Math.round(numTx / secs) : 0;
    }

    const epochProgressPct =
      epoch && epoch.slotsInEpoch
        ? Math.round((Number(epoch.slotIndex) / Number(epoch.slotsInEpoch)) * 100)
        : 0;
    const circulatingSol = supply?.value?.circulating
      ? Math.round(Number(supply.value.circulating) / 1e9)
      : 0;

    const watched = await Promise.all(
      WATCHLIST.map(async (w): Promise<WatchedVenue> => {
        const sigs = await this.sigsFor(w.address);
        return { label: w.label, recentTxns: sigs.length, lastSignature: sigs[0]?.signature };
      }),
    );

    const busiest = [...watched].sort((a, b) => b.recentTxns - a.recentTxns)[0];
    const headline =
      `Solana epoch ${epoch?.epoch ?? "?"} (${epochProgressPct}% through) at ~${tps} TPS; ` +
      `most active watched program: ${busiest?.label ?? "n/a"} (${
        busiest?.recentTxns ?? 0
      } recent txns).`;

    const signal: MarketSignal = {
      slot: Number(slot) || 0,
      epoch: Number(epoch?.epoch ?? 0),
      epochProgressPct,
      tps,
      circulatingSol,
      watched,
      headline,
      capturedAt: new Date().toISOString(),
    };
    this.log.info(signal.headline);
    return signal;
  }

  private async perfSamples(): Promise<any[]> {
    const primary = await this.client.rpc.getRecentPerformanceSamples(5).catch(() => [] as any[]);
    if (Array.isArray(primary) && primary.length) return primary;
    return this.fallback.rpc.getRecentPerformanceSamples(5).catch(() => [] as any[]);
  }

  private async supply(): Promise<any> {
    const primary = await this.client.rpc.getSupply().catch(() => null);
    if (primary?.value?.circulating) return primary;
    return this.fallback.rpc.getSupply().catch(() => null);
  }

  private async sigsFor(address: string): Promise<any[]> {
    const primary = await this.client.rpc
      .getSignaturesForAddress(pk(address), { limit: 25 })
      .catch(() => [] as any[]);
    if (Array.isArray(primary) && primary.length) return primary;
    return this.fallback.rpc
      .getSignaturesForAddress(pk(address), { limit: 25 })
      .catch(() => [] as any[]);
  }
}
