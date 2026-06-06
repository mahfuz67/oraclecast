# OracleCast 🛰️

**An autonomous on-chain Solana agent for the OOBE Protocol × Ace Data Cloud bounty.**

OracleCast runs a complete `trigger → reason → execute → pay` workflow with **no human in the loop**:
a cron fires, an agent loop **decides which tools to call**, it senses live Solana activity over
**Synapse RPC**, discovers agents on the **Synapse Agent Protocol (SAP)**, calls **Ace Data Cloud**
AI services, and **pays for every call per request in USDC over x402** — then delivers a market
briefing with a Merkle-proofed stance. Spending is bounded by hard per-run budget + tool-allowlist
guardrails.

**Submission category: Ace Data Cloud Usage (x402 Facilitator).** The codebase also implements the
Category-1 path (on-chain escrow + Synapse Sentinel + sell-side settlement); the live deployment
runs the Category-2 profile.

---

## ✅ Live on mainnet

|                 |                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Agent (SAP)     | [`7R1NSA8XgF8zKPsFCJ5nxUV2Uie8W1vD2VpAeq7oNjS9`](https://explorer.oobeprotocol.ai/agents/7R1NSA8XgF8zKPsFCJ5nxUV2Uie8W1vD2VpAeq7oNjS9) |
| Registration tx | [`2Ffic9E5…R67ZZ`](https://solscan.io/tx/2Ffic9E5F1CntjW6QgFKjkHgNutmAqZYq5DS3MK9wmNH8fAkFyMvfsAuD3EJ42r75cZ29zVgVLfqSjjS6pKR67ZZ)     |
| Wallet          | [`7SLVqVVE…m51R7N`](https://solscan.io/account/7SLVqVVE9wvjeQ8E3h5Gv4RRZC9JsbmETXbT8Xm51R7N)                                           |
| x402 payments   | per-request USDC `TransferChecked` to the Ace facilitator — see the wallet's token transfers                                           |

Every briefing run makes **3 distinct Ace Data Cloud calls, each paid via x402 in USDC**, confirmed
on Solana. The on-chain signatures are recorded in each `out/<id>/receipt.json`.

---

## Workflow

```
                 ┌──────────────────────── OracleCast ───────────────────────┐
  cron / order ─▶│ 1. SENSE     Synapse RPC      → live Solana signal         │
                 │ 2. CONTEXT   Ace serp/google  → web context     [x402 $]   │
                 │ 3. REASON    OOBE SDK          → Merkle-proofed stance [⊞]  │
                 │ 4. ANALYZE   Ace aichat        → briefing text   [x402 $]   │
                 │ 5. MEDIA     Ace flux (image)  → 3rd x402 service [x402 $]  │
                 │ 6. DELIVER   out/<id>/ : briefing.md + receipt.json         │
                 └────────────────────────────────────────────────────────────┘
   $ = USDC paid per request via the Ace x402 facilitator   ⊞ = OOBE Merkle proof
```

The agent loop chooses tools at each step (LLM-driven when an OpenAI key is set; otherwise a
deterministic planner walks the same tools). The **default Category-2 allowlist** is
`sense_market, web_search, decide_stance, write_analysis, make_infographic`. Three more tools ship
and are one allowlist entry away:

- `risk_check_sentinel` — consumes **Synapse Sentinel** via on-chain escrow (Category 1)
- `make_audio` — Ace Suno audio
- `settle_payment` — sell-side escrow settlement (Category 1)

---

## Quick start

Requires **pnpm** (`corepack enable`, or `npm i -g pnpm`).

```bash
pnpm install
cp .env.example .env     # defaults run fully simulated (DRY_RUN=1)
pnpm run-once            # one end-to-end briefing, no funds/keys needed
```

Artifacts land in `out/<briefing-id>/`: `briefing.md` (the report) and `receipt.json` (every
payment + on-chain signature).

### Commands

| Command                                        | What it does                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm gen-wallet`                              | Generate `wallet.json`; prints the public key to fund             |
| `pnpm balances`                                | Pre-flight: wallet, SOL/USDC, registration, Sentinel resolution   |
| `pnpm register`                                | Register the agent on SAP mainnet (idempotent)                    |
| `pnpm run-once`                                | One full autonomous briefing                                      |
| `pnpm loop`                                    | Continuous cron-driven operation (`BRIEFING_CRON`)                |
| `pnpm serve`                                   | HTTP: `/health`, `/agent`, `POST /briefings`, `/briefings/latest` |
| `pnpm wallet:export`                           | Print the wallet's base58 key (to import into Phantom)            |
| `pnpm conformance`                             | Assert every SDK class/method used exists (36 checks)             |
| `pnpm lint` · `pnpm format` · `pnpm typecheck` | ESLint · Prettier · strict `tsc`                                  |

---

## Going LIVE (real x402 volume)

1. **Ace Data Cloud** — create an account at <https://platform.acedata.cloud>. Leave
   `ACE_API_TOKEN` **empty** so calls settle via **x402** (on-chain USDC) rather than free credits.
2. **Synapse RPC** — free-tier key from <https://synapse.oobeprotocol.ai> → `SYNAPSE_RPC_URL`.
3. **Wallet** — `pnpm gen-wallet`, then fund the printed address with:
   - **~0.05 SOL** — registration is a one-time ~0.04 SOL account-rent deposit (recoverable on
     close), plus negligible per-tx fees. _(No stake is required to register.)_
   - **USDC (SPL)** — the budget the agent spends on Ace x402 calls (≈ 0.12 USDC per run).
4. Set `DRY_RUN=0`, then:
   ```bash
   pnpm balances     # confirm SOL + USDC, Sentinel resolves
   pnpm register     # one-time on-chain registration
   pnpm run-once     # verify: receipt.json shows ace-x402 USDC payments
   pnpm loop         # sustained autonomous volume
   ```

**RPC split (important).** `SYNAPSE_RPC_URL` is used for the read/sense side of execution. The
free-tier Synapse node can lag and hand out expired blockhashes, so **transaction submission** uses
`TX_RPC_URL` (defaults to a synced public RPC). Set `TX_RPC_URL` to a reliable endpoint (e.g. a free
Helius key) for best results.

---

## Bounty requirement mapping (Category 2)

| Requirement                                       | Where                                                         |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Registered on SAP mainnet                         | `SapService.register()` → live PDA above                      |
| Complete automated workflow (trigger→execute→pay) | `Scheduler` → `OracleAgent` → `BriefingService`               |
| Discovers tools via SAP                           | `SapService.resolveAgent()` (resolves Synapse Sentinel)       |
| Ace Data Cloud account + **x402 facilitator**     | `AceService` (`createX402PaymentHandler`, network `solana`)   |
| **≥3 distinct Ace services**                      | `serp/google`, `aichat`, `flux` images (audio/GLM also wired) |
| ≥1 AI capability                                  | `AceService` analysis + `OobeReasoner` stance                 |
| Synapse RPC in execution                          | `SynapseService` (sense/discovery over Synapse RPC)           |

Category-1 extras (escrow volume + Synapse Sentinel + sell-side settle) are implemented in
`SapService` and exposed as the `risk_check_sentinel` / `settle_payment` tools.

---

## Architecture

Dependency-injected, class-per-responsibility. `OracleCast` (the composition root) wires everything;
nothing reaches for a global.

```
src/
  oracle-cast.ts            composition root — constructs + wires all classes
  index.ts                  CLI (run-once | loop | serve | register)
  core/
    config.ts               Config    validated env + DRY_RUN (singleton)
    logger.ts               Logger
    receipt.ts              Receipt   payment + artifact audit trail
    solana.ts               Solana    keypair, tx connection, x402 wallet adapter
  services/
    synapse.service.ts      SynapseService  Synapse RPC → MarketSignal (synced fallback for metrics)
    ace.service.ts          AceService      AceDataCloud SDK + x402 (search/chat/image/audio/GLM)
    sap.service.ts          SapService      register / Sentinel escrow / settle (SapClient)
  reasoning/
    oobe-core.provider.ts   OobeCoreProvider  documented OobeCore (start/getAgent/genAi)
    oobe.reasoner.ts        OobeReasoner      stance + Merkle proof + on-chain inscription
  agent/
    tool.ts                 AgentTool (abstract) + RunState
    tools.ts                concrete tool classes (one per capability)
    budget.ts               Budget    hard SOL/USDC caps + allowlist
    oracle-agent.ts         OracleAgent  ReAct loop (LLM-driven or deterministic planner)
  pipeline/
    briefing.service.ts     BriefingService  orchestrate run + deliver bundle
  runtime/
    scheduler.ts            Scheduler   cron trigger
    server.ts               HttpServer  orders + latest briefing
```

### SDK usage

- **Ace Data Cloud / Synapse** — used via their own classes as documented:
  `new AceDataCloud({ paymentHandler })`, `new SynapseClient({ endpoint })`.
- **x402** — `createX402PaymentHandler({ network: "solana", solanaWallet })` from
  `@acedatacloud/x402-client`; the wallet adapter signs the USDC `TransferChecked` and submits it.
- **SAP** — the published `synapse-sap-sdk`: `new SapClient`, `AgentModule.registerAgent`, and the
  exposed Anchor `program` for escrow/settle. (The higher-level `SapConnection`/`client.agent.register`
  shown in the docs is **not in the published `0.19.8`**, so OracleCast targets the shipped surface.)
- **OOBE** — the documented `OobeCore` flow (`new OobeCore` → `start` → `getAgent` → `genAi` /
  `getDefaultPersonality` / `merkleValidate` / `merkle.onChainMerkleInscription`), plus
  `MerkleTreeManager` for the off-chain proof. `pnpm conformance` asserts all of these exist.

> **Why pnpm.** OOBE transitively imports `@orca-so/whirlpools-sdk@0.13.x`, which pins
> `@coral-xyz/anchor ~0.29.0` as a _peer_ and ships a pre-0.30 IDL that Anchor 0.31 (needed by SAP)
> rejects with `Account not found: AdaptiveFeeTier`. npm flat-hoists whirlpools onto anchor 0.31, so
> it crashes. The `pnpm.overrides` entry `"@orca-so/whirlpools-sdk>@coral-xyz/anchor": "0.29.0"`
> gives whirlpools its own anchor 0.29 while SAP keeps 0.31 — reproducibly, no `node_modules` patching.

> **Why a bundler.** `synapse-sap-sdk`'s ESM build has extensionless imports + a re-export cycle that
> Node's loader rejects, and `x402-client` lazily imports `ethers`. `pnpm build` bundles each entry
> with esbuild (CJS; `ethers` + `oobe-protocol` external), flattening the cycle. Run scripts build first.

---

## Honest limitations

- **Image / audio / video deliverables.** The agent calls and **pays for** image (flux) as its 3rd
  x402 service, and the Suno-audio and GLM tools are wired too. But Ace's media services are async
  and **bill x402 on every status-poll** while the job renders — on a small budget that drains funds
  fast — so the live profile submits + pays once and does not poll for the finished media. The
  integration is complete; with more runway OracleCast would ship full multimedia briefings.
- **Synapse free-tier node** lagged during testing, hence the read/tx RPC split above.

---

## Safety & legitimacy

- **Guardrails.** The LLM may _choose_ actions but cannot overspend: every paid tool is gated by
  hard per-run caps (`RUN_BUDGET_USDC`, `RUN_BUDGET_LAMPORTS`), a tool allowlist, and `AGENT_MAX_STEPS`.
  A tool that would breach a cap is refused _before_ any payment.
- **`DRY_RUN=1` (default)** simulates all chain writes + Ace payments; on-chain reads stay real.
- **Real activity, not wash trading.** Each x402 payment buys a genuine Ace AI result from a
  third-party facilitator; the cron cadence is a realistic content schedule.
- **Secrets** (`.env`, `wallet.json`) are gitignored and never committed.
