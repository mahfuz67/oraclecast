# OracleCast 🛰️

**An autonomous, two-sided, self-funding on-chain agent for the OOBE Protocol × Ace Data Cloud bounty.**

OracleCast is a genuine **tool-using agent**: after registering its identity on SAP, an
**OOBE-powered ReAct loop decides which tools to call** to run a complete `trigger → reason →
execute → pay` workflow with **no human in the loop** — sensing live Solana activity, getting it
risk-validated by **Synapse Sentinel**, deciding a Merkle-proofed stance, generating a
**multimedia market briefing** (text + image + audio) via **Ace Data Cloud** (settled with
**x402**), and settling subscriber payments via **on-chain escrow** on SAP mainnet — all inside
**hard per-run budget + tool-allowlist guardrails**.

When no LLM key is configured (or in DRY_RUN), a deterministic planner walks the same tools so the
workflow always runs end-to-end without funds.

> One genuine product (an autonomous market briefing) produces real volume in **both** reward
> categories — escrow volume (Category 1) and Ace Data Cloud x402 volume (Category 2) — without
> wash trading.

---

## The two-sided loop

```
                ┌──────────────────────── OracleCast agent ────────────────────────┐
  Subscriber    │                                                                   │
  (real         │  1. SENSE     Synapse RPC  → live on-chain market signal          │
   counterparty)│  2. CONTEXT   Ace search   → web context              [x402 $]    │
      │ escrow  │  3. VALIDATE  Synapse Sentinel (escrow deposit)       [escrow ◎]  │
      ▼ deposit │  4a.REASON    OOBE SDK → Merkle-proofed market stance [merkle ⊞]  │
   ┌─────────┐  │  4b.ANALYZE   Ace aichat   → briefing text            [x402 $]    │
   │ EscrowV2│──┼▶ 5. IMAGE     Ace images   → infographic              [x402 $]    │
   └─────────┘  │  6. AUDIO     Ace audio (Suno) → narration            [x402 $]    │
   settle 1 call│  7. SETTLE    settle 1 call on subscriber escrow      [escrow ◎]  │
                │  8. DELIVER   out/<id>/ : briefing.md + media + receipt.json      │
                └───────────────────────────────────────────────────────────────────┘
   ◎ = SOL via SAP escrow (Cat 1)   $ = USDC via Ace x402 (Cat 2)   ⊞ = OOBE Merkle proof
```

- **Sell side (Category 1):** OracleCast is registered on SAP as a provider of the
  `oracle:briefing` capability. A real subscriber funds an `EscrowV2` toward the agent; each
  delivered briefing **settles one call** (`settle_calls_v2`). It also **consumes Synapse Sentinel**
  every run by funding an escrow toward it — satisfying the mandatory Sentinel requirement and
  generating escrow volume.
- **Buy side (Category 2):** every briefing consumes **4 distinct Ace Data Cloud services**
  (`search`, `aichat`, `images`, `audio`) paid per request in USDC through the **AceDataCloud x402
  facilitator** on Solana — exceeding the 3-distinct-service requirement.
- **Reasoning core (OOBE Protocol SDK):** the agent's _market stance_ is produced by the
  [`oobe-protocol`](https://oobe-protocol.gitbook.io/oobe-protocol) SDK via the documented
  `OobeCore` flow — `new OobeCore(config)` → `start()` → `getAgent()`, then `agent.genAi()` +
  `agent.getDefaultPersonality()` to reason over a **memory of prior briefings**. Each decision is
  committed to a Merkle tree (`MerkleTreeManager`) for a verifiable root + proof, and, when a live
  OobeCore agent is available, inscribed **on-chain** via `agent.merkleValidate()` +
  `agent.merkle.onChainMerkleInscription()` — making the agent's reasoning auditable, not just its payments.

---

## Quick start

```bash
pnpm install
cp .env.example .env          # fill in keys for LIVE; defaults run in DRY_RUN
pnpm build                 # bundle (esbuild) — required, see "Why a bundler" below

# Fully simulated end-to-end run (no funds, no keys needed):
pnpm run-once

# Pre-flight against mainnet (reads only):
pnpm balances
```

Artifacts land in `out/<briefing-id>/`:

- `briefing.md` — the human-readable report
- `cover.png` / `briefing.mp3` — generated media (LIVE only)
- `receipt.json` — full audit trail of every payment + tx signature

### Modes

| Command                     | What it does                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| `pnpm run-once`             | One full autonomous briefing                                             |
| `pnpm loop`                 | Continuous cron-driven operation (`BRIEFING_CRON`)                       |
| `pnpm serve`                | HTTP server: `/health`, `/agent`, `POST /briefings`, `/briefings/latest` |
| `pnpm register`             | Register the agent on SAP (idempotent)                                   |
| `pnpm fund`                 | Open/fund an escrow (subscriber tool or Sentinel top-up)                 |
| `pnpm balances`             | Pre-flight: wallet, SOL/USDC, registration, Sentinel resolution          |
| `pnpm conformance`          | Assert every SDK class/method used exists (36 checks)                    |
| `pnpm lint` / `pnpm format` | ESLint (typescript-eslint) / Prettier                                    |
| `pnpm typecheck`            | Strict `tsc --noEmit`                                                    |

---

## Going LIVE (real mainnet volume)

1. **Wallet** — set `WALLET_PATH` (Solana CLI keypair) or `WALLET_SECRET_KEY`. Fund it with:
   - **SOL** for tx fees, the ~1 SOL agent stake, and escrow deposits (Category 1 volume).
   - **USDC (SPL)** for Ace x402 payments (Category 2 volume). The wallet needs a USDC ATA.
2. **Synapse RPC** — set `SYNAPSE_RPC_URL` to your mainnet endpoint with `?api_key=...`
   (free tier at <https://synapse.oobeprotocol.ai>).
3. **Ace Data Cloud** — create an account at <https://platform.acedata.cloud> (Google/GitHub →
   free credits). x402 needs no API key for pay-per-request; `ACE_API_TOKEN` is an optional fallback.
4. **Set `DRY_RUN=0`** and:
   ```bash
   pnpm balances     # confirm funds + Sentinel resolves
   pnpm register     # register OracleCast on SAP (one time)
   pnpm run-once     # one real briefing — check out/<id>/receipt.json for tx signatures
   pnpm loop         # sustained autonomous volume
   ```
5. **Subscribers (sell side):** a _second, real_ wallet runs `pnpm fund` with
   `FUND_TARGET=<OracleCast agentPda>` to subscribe. Set `SUBSCRIBER_PUBKEY` (+ matching
   `SUBSCRIBER_ESCROW_NONCE`) so the agent settles their calls. Self-funding the same wallet is
   wash trading and is intentionally **not** done here.

Verify everything on the [Synapse Explorer](https://explorer.oobeprotocol.ai) (agent + escrow
activity) and the Ace Data Cloud usage dashboard (x402 spend).

---

## Bounty requirement mapping

| Requirement                                       | Where                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Registered on SAP mainnet                         | `SapService.register()` (`AgentModule.registerAgent`)                              |
| Complete automated workflow (trigger→execute→pay) | `BriefingService` + `OracleAgent` + `Scheduler`                                    |
| Discovers tools via SAP                           | `SapService.resolveAgent()` (Sentinel)                                             |
| Escrow payments + Synapse RPC in execution        | `SapService`, `SynapseService`                                                     |
| ≥1 AI capability                                  | `AceService` + `OobeReasoner` (LLM reasoning)                                      |
| On-chain agent reasoning + verifiable memory      | `OobeReasoner` + `OobeCoreProvider` (OobeCore agent + on-chain Merkle inscription) |
| **Uses Synapse Sentinel** (Category 1)            | `SapService.assessWithSentinel()` (escrow toward Sentinel)                         |
| Ace Data Cloud account + **x402 facilitator**     | `AceService` (`createX402PaymentHandler`)                                          |
| **≥3 distinct Ace services** (Category 2)         | `search`, `aichat`, `images`, `audio` (4)                                          |

---

## Architecture

A dependency-injected, class-per-responsibility design. `OracleCast` (the composition root) wires
every service; nothing reaches for a global.

```
src/
  oracle-cast.ts            composition root — constructs + wires all classes
  index.ts                  CLI (run-once | loop | serve | register)
  core/
    config.ts               class Config       validated env + DRY_RUN switch (singleton)
    logger.ts               class Logger
    receipt.ts              class Receipt       payment + artifact audit trail
    solana.ts               class Solana        keypair, RPC connection, x402 wallet adapter
  services/
    synapse.service.ts      class SynapseService  Synapse RPC → MarketSignal
    ace.service.ts          class AceService      AceDataCloud SDK + x402 (chat/search/image/audio)
    sap.service.ts          class SapService      register / Sentinel escrow / settle (SapClient)
  reasoning/
    oobe-core.provider.ts   class OobeCoreProvider  documented OobeCore (start/getAgent/genAi)
    oobe.reasoner.ts        class OobeReasoner      stance + Merkle proof + on-chain inscription
  agent/
    tool.ts                 abstract class AgentTool + RunState
    tools.ts                concrete tool classes (one per capability)
    budget.ts               class Budget          hard SOL/USDC caps + allowlist
    oracle-agent.ts         class OracleAgent     ReAct loop (LLM-driven or planner)
  pipeline/
    briefing.service.ts     class BriefingService orchestrate run + deliver bundle
  runtime/
    scheduler.ts            class Scheduler       cron trigger
    server.ts               class HttpServer      orders + latest briefing
```

### SDK usage notes

- **Ace Data Cloud / Synapse** are used via their own classes as documented — `new AceDataCloud({ paymentHandler })`, `new SynapseClient({ endpoint })`.
- **SAP** uses the published `synapse-sap-sdk` (`new SapClient`, `AgentModule.registerAgent`, and the exposed Anchor `program` for escrow/settle). The higher-level `SapConnection`/`client.agent.register` API shown in the SAP docs is **not present in the published `0.19.8`**, so OracleCast targets the shipped surface.
- **OOBE** is used via the documented `OobeCore` class flow (`new OobeCore(config)` → `start()` →
  `getAgent()` → `genAi()` / `getDefaultPersonality()` / `merkleValidate()` /
  `merkle.onChainMerkleInscription()`), plus `MerkleTreeManager` for the off-chain proof.

> **Why pnpm.** OOBE's barrel transitively imports `@orca-so/whirlpools-sdk@0.13.x`, which pins
> `@coral-xyz/anchor ~0.29.0` as a _peer_ and ships a pre-0.30 IDL. Under Anchor 0.31 (needed by
> SAP), its `BorshAccountsCoder` throws `Account not found: AdaptiveFeeTier`. npm flat-hoists
> whirlpools and forces it onto the top-level anchor 0.31, so the crash is unavoidable on npm.
> **pnpm** isolates dependencies, and the `pnpm.overrides` entry
> `"@orca-so/whirlpools-sdk>@coral-xyz/anchor": "0.29.0"` gives whirlpools its own anchor 0.29
> while SAP keeps 0.31 — reproducibly, with no `node_modules` patching. **Install with `pnpm`.**

### Why a bundler (esbuild)?

The `@oobe-protocol-labs/synapse-sap-sdk` ESM build uses extensionless imports and a re-export
cycle that Node's strict ESM loader rejects, and `@acedatacloud/x402-client` lazily imports
`ethers` (EVM-only). `pnpm build` bundles each entrypoint with esbuild (CJS); `ethers` and
`oobe-protocol` are marked external (required at runtime from pnpm's store), and the SAP cycle is
flattened. All run scripts build first automatically.

---

## Safety & legitimacy

- **Agentic guardrails.** The LLM may _choose_ actions, but it cannot overspend: every paid tool
  is gated by hard per-run caps (`RUN_BUDGET_LAMPORTS`, `RUN_BUDGET_USDC`), an optional
  `AGENT_TOOL_ALLOWLIST`, and `AGENT_MAX_STEPS`. A tool that would breach a cap is refused _before_
  any chain/payment call, and the agent adapts. Settlement amounts are fixed by config, not the LLM.
- **`DRY_RUN=1` (default)** simulates all chain writes and Ace payments — the full pipeline,
  receipts, and artifacts work with zero funds or keys. On-chain **reads** are always real.
- Volume is real product activity: Ace x402 spend and Sentinel consumption have genuine
  third-party counterparties; the subscriber path is counterparty-driven by design.
- The cron cadence (`BRIEFING_CRON`, default every 30 min) reflects a realistic content schedule,
  not a tight artificial loop.
