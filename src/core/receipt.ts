export interface PaymentRecord {
  kind:
    | "ace-x402"
    | "escrow-create"
    | "escrow-settle"
    | "sentinel"
    | "stake"
    | "register"
    | "oobe-reasoning";
  description: string;
  signature?: string;
  amount?: string;
  asset?: string;
  simulated: boolean;
  at: string;
}

/** Per-run audit trail of payments, on-chain signatures, and output artifacts. */
export class Receipt {
  readonly startedAt = new Date().toISOString();
  readonly payments: PaymentRecord[] = [];
  readonly artifacts: Record<string, string> = {};
  meta: Record<string, unknown> = {};

  record(payment: Omit<PaymentRecord, "at">): void {
    this.payments.push({ ...payment, at: new Date().toISOString() });
  }

  addArtifact(name: string, pathOrUrl: string): void {
    this.artifacts[name] = pathOrUrl;
  }

  totals(): Record<string, string> {
    const out: Record<string, bigint> = {};
    for (const p of this.payments) {
      if (!p.amount) continue;
      const asset = p.asset ?? "lamports";
      out[asset] = (out[asset] ?? 0n) + BigInt(p.amount);
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.toString()]));
  }

  toJSON() {
    return {
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      meta: this.meta,
      payments: this.payments,
      totals: this.totals(),
      artifacts: this.artifacts,
    };
  }
}
