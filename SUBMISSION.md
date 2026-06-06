# OracleCast — Submission Kit

**Category: Ace Data Cloud Usage (x402 Facilitator).** OracleCast is an autonomous on-chain
agent that produces multimedia Solana market briefings: it senses the chain via Synapse RPC,
discovers/consumes agents on SAP, and pays per request for Ace Data Cloud AI services (search,
chat, image, audio) over **x402 in USDC** — with no human in the loop.

This kit takes you from a fresh wallet to **real on-chain x402 volume** with ~9 USDC + ~$4 of SOL.

---

## 0. Budget plan (9 USDC + ~0.03 SOL)

| Use                                                   | Asset    | Approx    |
| ----------------------------------------------------- | -------- | --------- |
| SAP registration (one-time account rent)              | SOL      | ~0.01     |
| x402 tx fees (hundreds of payments, ~0.000005 each)   | SOL      | ~0.01     |
| **Ace Data Cloud service calls (your scored volume)** | **USDC** | **all 9** |

> You only "win" one category, so put 100% of the USDC into Ace (Category 2). We deliberately
> **skip** the SOL-spending Sentinel/escrow loop and run OobeCore's on-chain writes off (heuristic
> reasoning + off-chain Merkle proof) to conserve SOL for what counts.

---

## 1. Prerequisites (free)

1. **Ace Data Cloud account** — sign up at <https://platform.acedata.cloud> (Google/GitHub).
   You get free credits; we still pay via **x402** so spend lands on-chain as volume.
2. **Synapse RPC key** — grab the free tier at <https://synapse.oobeprotocol.ai>. You'll paste it
   into `SYNAPSE_RPC_URL`.

## 2. Create + fund the agent wallet

```bash
pnpm install
pnpm gen-wallet          # writes ./wallet.json, prints the PUBLIC KEY
```

Send to that public key:

- **~0.03 SOL** (registration + gas)
- **9 USDC** (SPL mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) — receiving USDC creates the
  token account automatically.

## 3. Configure `.env` (Category-2 profile)

```env
DRY_RUN=0
SYNAPSE_RPC_URL=https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=YOUR_KEY
WALLET_PATH=./wallet.json

# Ace Data Cloud — leave the token EMPTY to force x402 USDC payment (the scored volume).
ACE_BASE_URL=https://api.acedata.cloud
ACE_API_TOKEN=
ACE_PAYMENT_NETWORK=solana

# Conserve SOL: no OpenAI key => planner-driven, heuristic stance, off-chain Merkle proof.
OPENAI_API_KEY=

# Ace-only tool loop (no Sentinel/settle => no SOL escrow spend). 4 distinct Ace services.
AGENT_TOOL_ALLOWLIST=sense_market,web_search,decide_stance,write_analysis,make_infographic,make_audio

# Pace + caps. Per-run USDC cap is a safety net; the wallet's 9 USDC is the real limit.
RUN_BUDGET_USDC=1000000
RUN_BUDGET_LAMPORTS=200000
AGENT_MAX_STEPS=8
BRIEFING_CRON=*/15 * * * *

AGENT_NAME=OracleCast
```

## 4. Pre-flight, register, go

```bash
pnpm balances     # confirm SOL + USDC arrived, Sentinel resolves, RPC works
pnpm register     # one-time: registers OracleCast on SAP mainnet (find it on Synapse Explorer)
pnpm run-once     # ONE real briefing — verify a real x402 USDC payment happened (see §5)
pnpm loop         # autonomous: a briefing every 15 min, paying Ace via x402, until USDC runs out
```

Leave `pnpm loop` running on a VPS / always-on machine so volume keeps accruing through the
evaluation window. The cadence (every 15 min) is a realistic content schedule — **not** a tight
spam loop (which gets disqualified).

## 5. Verify it's REAL volume

After `run-once`, open the newest `out/oraclecast-*/receipt.json`:

- `payments[]` entries with `kind: "ace-x402"`, `simulated: false`, a USDC `amount`, and the Ace
  endpoint URL.
- Look up your wallet on <https://solscan.io> → you'll see USDC `TransferChecked` txns to the Ace
  facilitator. **That is your Category-2 volume.**
- Your agent appears on the [Synapse Explorer](https://explorer.oobeprotocol.ai) registry.
- Your spend shows on the Ace Data Cloud usage dashboard.

If a call returns 401 instead of 402, set `ACE_API_TOKEN` to your Ace key — x402 still settles
payment on the 402 challenge once free credits are exhausted.

---

## 6. Demo video script (~90 seconds)

Record your screen. Hit every judging point:

1. **(0:00) What it is** — "OracleCast: an autonomous on-chain agent that produces multimedia
   Solana market briefings and pays for AI per-use via x402. Category: Ace Data Cloud Usage."
2. **(0:10) Autonomy** — show `pnpm loop` running; point out the cron trigger and that you type
   nothing — the agent's loop decides which tools to call each step (`oracle-agent.ts`).
3. **(0:25) Tool discovery via SAP** — `pnpm balances` showing `sentinel … OK ("Synapse Sentinel")`
   and your agent registered on the Synapse Explorer registry. "It resolves agents on SAP."
4. **(0:40) Ace services + why** — show the log calling `web_search`, `write_analysis` (chat),
   `make_infographic` (image), `make_audio` (Suno): "four distinct Ace Data Cloud APIs — search for
   context, chat for analysis, image + audio for the briefing media."
5. **(0:55) Payments via x402** — open `receipt.json`; show the `ace-x402` USDC payments; open
   Solscan and show the USDC TransferChecked to the facilitator. "Every AI call is paid per-request
   in USDC over x402 — no API key, no human."
6. **(1:10) Output** — open `out/<id>/briefing.md` (analysis + Merkle-proofed stance + media links).
7. **(1:20) Close** — "Trigger → tool selection → execution → x402 payment, fully autonomous.
   GitHub + repo in the post."

---

## 7. X post (paste, fill the two links)

> 🛰️ Built **OracleCast** for the @OOBEonSol × @AceDataCloud bounty — an autonomous on-chain agent
> that produces multimedia Solana market briefings and **pays for every AI call per-request in USDC
> via x402** (no human in the loop).
>
> 🧠 Discovers/consumes agents on **SAP** · 🔎 uses **4 Ace Data Cloud APIs** (search, chat, image,
> audio) · 💸 settles via the **Ace x402 facilitator** on Solana · ⛓️ runs trigger → tool-selection
> → execution → payment on a cron, fully autonomously.
>
> Category: **Ace Data Cloud Usage**.
>
> Demo: <LINK> · Repo: <GITHUB_LINK>
>
> @OOBEonSol @AceDataCloud

---

## 8. Legitimacy (don't get disqualified)

- Real product, real spend: every payment buys an actual Ace AI result that goes into a briefing.
- Realistic cadence (15 min), not a tight artificial loop.
- No wash trading: you pay Ace's facilitator for real services — a genuine third-party counterparty.
- Settlement amounts and tool selection are bounded by hard budgets and an allowlist.
