# OracleCast — Demo Recording Script (~2 min)

Category: **Ace Data Cloud Usage (x402 Facilitator)**

---

## Before you hit record (30-second checklist)

- [ ] **Hide your secret.** The startup log prints `rpc=...api_key=sk_live_...`. Crop that line out
      of frame, blur it in editing, or scroll past it fast. Never show `.env` or `wallet.json`.
- [ ] Make the terminal font **big** (readable on phones).
- [ ] Open 3 tabs ready: the **terminal**, **Synapse Explorer** (your agent), **Solscan** (your wallet):
  - Explorer: `https://explorer.oobeprotocol.ai/agents/7R1NSA8XgF8zKPsFCJ5nxUV2Uie8W1vD2VpAeq7oNjS9`
  - Solscan: `https://solscan.io/account/7SLVqVVE9wvjeQ8E3h5Gv4RRZC9JsbmETXbT8Xm51R7N`
- [ ] **Each live run costs ~0.12 USDC** — do ONE clean take, or screen-record one run and
      voice-over afterward. Don't do 10 takes.
- [ ] Have `out/<latest>/receipt.json` open in your editor.

> Read this out loud once before recording so it flows. Talk like you're showing a friend what you
> built — relaxed, a little proud.

---

## SCENE 1 — Who + what (0:00–0:15)

**SHOW:** Face cam, or the README title on screen.

**SAY:**

> "Hey, I'm Mahfuz. This is **OracleCast** — my entry for the OOBE Protocol × Ace Data Cloud bounty,
> in the **Ace Data Cloud Usage** category. It's an autonomous on-chain agent that produces Solana
> market briefings and **pays for every AI call itself — per request, in USDC, over x402.** No human
> in the loop. Let me show you."

---

## SCENE 2 — It's a real agent on SAP (0:15–0:35)

**SHOW:** Terminal — `pnpm balances`. Point at `agent PDA … REGISTERED ("OracleCast")` and
`sentinel … OK ("Synapse Sentinel")`. Then flip to the **Synapse Explorer** tab.

**SAY:**

> "First — it's registered on the **Synapse Agent Protocol**, on mainnet. There's its on-chain
> identity, and here it is on the Synapse Explorer. And see this line? It's resolving the **Synapse
> Sentinel** agent on SAP — that's how it discovers other agents and tools. All over **Synapse RPC**."

---

## SCENE 3 — Run it, hands off (0:35–1:05)

**SHOW:** Terminal — `pnpm loop`. Let the first cycle play. Point at `sense_market` → the real TPS
line, then each `step N: action=…`.

**SAY:**

> "Now I just… start it, and step back. One command. From here it's completely autonomous — it
> decides what to do each step. First it **senses the chain over Synapse RPC** — live Solana data,
> real TPS. Then the loop starts picking tools. I'm not typing anything — it's driving itself."

---

## SCENE 4 — Ace services + x402 payments (1:05–1:40)

**SHOW:** The log lines — point at each `402 … (solana)` then `x402 payment confirmed <sig>`. Then
`receipt.json` in your editor. Then the **Solscan** tab showing USDC transfers.

**SAY:**

> "Here's the part I'm proud of. It calls **three different Ace Data Cloud services** — web search
> for context, their chat model to write the analysis, and an image service. Every call is **paid per
> request, in USDC, over x402.** Watch: `402 Payment Required` → it signs a USDC payment →
> **confirmed on Solana.** No API key, no me — the agent pays for its own tools. Here's the receipt,
> and on Solscan you can see the USDC actually leaving the wallet to the Ace facilitator. That's the
> whole thesis: discover, execute, pay — autonomously."

---

## SCENE 5 — The output (1:40–1:55)

**SHOW:** Open the newest `out/<id>/briefing.md`.

**SAY:**

> "And out comes a finished briefing — the analysis, a decisive market stance committed to a **Merkle
> proof** so the reasoning is verifiable, and the live on-chain numbers. All without me touching it."

---

## SCENE 6 — Honest note + vision (1:55–2:15)

**SHOW:** Stay on the briefing, or back to face cam.

**SAY:**

> "Real talk on one thing: I built in **image, audio, and video** too — the agent calls them and pays
> for them. But those are async jobs, and Ace charges x402 **on every status-poll** while they
> render — on a small budget that burns through funds fast. So I kept this run lean and didn't poll
> for the finished media. The integration's all there, though. With real runway, OracleCast could be
> shipping full **multimedia** briefings — images, audio, even video narration — every few minutes,
> on-chain, paying its own way. Honestly, the possibilities are endless."

---

## SCENE 7 — Close (2:15–2:25)

**SHOW:** The GitHub repo page.

**SAY:**

> "So that's **OracleCast** — discovers tools on SAP, executes with Ace Data Cloud, settles its own
> payments with x402, fully autonomous. Code's open-source, link's in the post. Thanks for watching."

---

## After recording — post on X

Tag **@OOBEonSol** and **@AceDataCloud**, state **Category: Ace Data Cloud Usage**, include the demo
video + repo link (`https://github.com/mahfuz67/oraclecast`). Draft post is in `SUBMISSION.md` §7.
