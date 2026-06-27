# Owo — Technical Architecture & 4-Month Build Plan

### From scratch → MVP → production

**Product:** A circular G$ economy for Nigeria — a _spend rail_ (airtime, data, electricity, merchant payments in G$) backed by a *peer-to-peer G$↔Naira marketplace\*, designed so G$ keeps circulating inside the ecosystem rather than leaking out.

**Built on:** Celo (chainId 42220), where G$ lives as an ERC‑677 token.

**Author:** Owo team.
**Status:** Design v1. Regulatory sections are engineering guidance, _not legal advice_ — validate with Nigerian counsel and your licensed payment partners.

---

## 0. How to read this document

- **Sections 1–3** frame the product and the architectural thesis.
- **Sections 4–13** are the technical architecture (on-chain, backend, data, flows, identity, security, compliance, infra, stack).
- **Section 14** is the **4-month execution plan** — the centerpiece — broken into eight 2-week sprints with exit criteria, mapped to the GoodBuilders milestones (M1–M4).
- **Sections 15–18** cover KPIs, team, risks, and appendices (repo layout, SDKs, env, glossary).

---

## 1. Architectural thesis

Three ideas shape every decision below.

**1. Spend-first, not cash-out-first.** The default, most visible action is _spending_ G$ (top-ups, merchant pay). Cash-out (P2P sell to Naira) is the quieter liquidity valve underneath. This is a product _and_ qualification stance: net G$ outflow trends toward zero because the same G$ rotates earner → buyer → merchant → re-seller.

**2. Custody-light by default.** Owo should hold user funds for the shortest possible time and the smallest possible amount. P2P trades settle through an **on-chain escrow contract**, not a company wallet. The only meaningful balance Owo carries is the **Treasury float** that backstops liquidity — and that is ring-fenced, hedged, and multisig-controlled.

**3. Built for a ₦/low-end-Android reality.** Users earn fractions of a cent of G$ daily on cheap phones with patchy data. That forces three non-negotiables: **gasless UX** (users never hold CELO for gas), **amount accumulation** (you cannot off-ramp dust economically — batch it), and a **PWA/mini-app** that runs on 2GB devices and inside MiniPay.

---

## 2. Scope & principles

### In scope (4 months)

- Identity-gated onboarding (GoodDollar uniqueness + tiered KYC for Naira).
- P2P G$↔Naira marketplace with on-chain escrow and dispute handling.
- Spend rail v1: airtime + data top-ups in G$ (electricity fast-follow).
- Engagement Rewards: first-spend and referral bonuses.
- Treasury liquidity backstop (market-maker of last resort).
- Merchant acceptance pilot (batched settlement) — late, small, controlled.

### Explicit non-goals (for now)

- No DeFi yield, lending, or token launch.
- No multi-country expansion (Nigeria only; architecture stays country-pluggable).
- No native iOS/Android app at launch (PWA + MiniPay mini-app first).
- No custodial "Owo balance" wallet product — non-custodial smart accounts only.

### Engineering principles

- **Money is a ledger, not a number in a column.** All value movement is double-entry, append-only, reconciled against chain + bank truth daily.
- **Providers are interfaces.** Payout rails, biller/VTU, and KYC vendors sit behind swappable adapters. Never hard-couple to one vendor.
- **Idempotency everywhere.** Every payout, mint, and webhook has an idempotency key. Money operations must be safe to retry.
- **Fail closed on money, fail open on UX.** A degraded biller can show a friendly retry; a degraded escrow must never release funds.

---

## 3. System overview

```
                         ┌─────────────────────────────────────────────┐
        CLIENTS          │  PWA (mobile-first)   │  MiniPay mini-app    │
                         │  React + Vite + Wagmi/Viem + Reown AppKit    │
                         └───────────────┬─────────────────────────────┘
                                         │ HTTPS / WS (JWT, SIWE session)
                         ┌───────────────▼─────────────────────────────┐
        EDGE             │   API Gateway  (rate-limit, auth, WAF)        │
                         └───────────────┬─────────────────────────────┘
                                         │
   ┌─────────────────────────────────────┼───────────────────────────────────────┐
   │                CORE SERVICES (Node/TS, event-driven)                          │
   │  Identity/KYC  │  Matching   │  Orders/Trades │  Payout       │  Spend/Biller │
   │  service       │  engine     │  service       │  orchestrator │  service      │
   │  ───────────── │  ────────── │  ───────────── │  ──────────── │  ──────────── │
   │  Ledger (double-entry)  │  Treasury/Liquidity │  Reconciliation │ Rewards hook │
   │  Indexer (chain events) │  Notifications      │  Webhook router │ Admin/Ops    │
   └───────┬───────────────────────┬───────────────────────┬──────────────────────┘
           │                       │                        │
   ┌───────▼────────┐   ┌──────────▼───────────┐   ┌────────▼─────────────────────┐
   │  ON-CHAIN (Celo)│   │ DATA                │   │ EXTERNAL RAILS               │
   │  OwoEscrow      │   │ PostgreSQL (ledger, │   │ Naira payout (licensed PSP)  │
   │  OwoTreasury    │   │   orders, KYC refs) │   │ VTU/biller aggregator        │
   │  OwoRewards     │   │ Redis (queues,locks,│   │ KYC/AML vendor (NIN/BVN)     │
   │  G$ (ERC-677)   │   │   match book)       │   │ GoodDollar Identity contract │
   │  Identity contr.│   │ Object store (KYC   │   │ Paymaster / bundler (AA)     │
   │  Paymaster (AA) │   │   docs, encrypted)  │   │ Sanctions screening          │
   └─────────────────┘   └─────────────────────┘   └──────────────────────────────┘
```

**On-chain vs off-chain split.** Anything that must be _trustless and final_ lives on-chain (escrow of G$, treasury settlement, reward grants). Anything that is _fiat, private, or high-frequency_ lives off-chain (Naira movement, KYC documents, the order book, matching). The two are stitched together by the **Indexer** (chain → backend) and **signed transactions** (backend/clients → chain).

---

## 4. On-chain architecture

### 4.1 Contracts to build

| Contract      | Purpose                                                                                                                                       | Key risk it removes                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `OwoEscrow`   | Holds a seller's G$ during a P2P trade; releases to buyer on confirmed Naira payment, or refunds on timeout/dispute.                          | Owo never custodies the G$ leg of a trade.  |
| `OwoTreasury` | Owo-owned liquidity float; buys G$ from sellers when no peer is available, supplies G$ to buyers/merchant settlement. Multisig-governed.      | Marketplace cold-start; thin DEX liquidity. |
| `OwoRewards`  | Thin wrapper / hook that triggers Engagement Rewards claims for qualifying actions (first spend, referral) so rewards are auditable on-chain. | Off-chain reward accounting disputes.       |

**You are not reinventing the token.** G$ is the existing ERC‑677 contract on Celo. Owo integrates with it (and with the GoodDollar **Identity contract** that marks verified/unique addresses).

### 4.2 `OwoEscrow` design

State machine per trade:

```
CREATED ──fund(G$)──▶ FUNDED ──buyerLocked──▶ LOCKED
   │                    │                        │
   │                    │                 confirmPayment (oracle/operator + buyer proof)
   │                    │                        ▼
   └──cancel────────────┴──timeout──▶ REFUNDED   RELEASED ──▶ (buyer receives G$)
                                          ▲          │
                                          └─dispute──┘ resolved by arbiter window
```

- **Funding:** seller deposits G$ via `transferAndCall` (ERC‑677) — single tx, no separate approve.
- **Locking:** when matched, the trade locks to one buyer with a deadline (e.g., 15–30 min) to pay Naira.
- **Release authority:** a **payment-confirmation signer** (Owo's backend, holding an isolated signer key) co-signs release _after_ the Naira payment is verified by the Payout service. v1 uses an operator-attestation model; v2 can move toward verifiable bank-webhook proofs / a small arbiter set to reduce trust.
- **Refund/timeout:** if the buyer doesn't pay before the deadline, anyone can call `refund()` to return G$ to the seller. No funds can be stranded.
- **Dispute:** a bounded dispute window routes to an arbiter role (initially Owo ops via multisig; later a small independent set). Disputed funds cannot be unilaterally released by either party.
- **Fees:** protocol fee taken in G$ on release (keeps value in-ecosystem), routed to `OwoTreasury`.

Security must-haves: reentrancy guards, checks-effects-interactions, pull-over-push where possible, per-trade isolation (no shared pooled balance that one bad trade can drain), pausability with a timelocked admin, and an upper-bound trade size in v1.

### 4.3 `OwoTreasury`

- Holds a G$ float + a stable leg (e.g., cUSD/USDC on Celo) for rebalancing.
- **Buy-side of last resort:** quotes a spread-bounded price; buys seller G$ when peer demand is absent.
- **Supply-side:** funds buyer orders and merchant settlement from inventory.
- **Risk controls on-chain:** max inventory, max per-tx, daily volume cap, oracle-bounded pricing, and a circuit-breaker `pause()`.
- **Governance:** owned by a Safe multisig (2-of-3 or 3-of-5). No single hot key can move treasury principal.

### 4.4 Account abstraction & gasless

Users must never need CELO. Two complementary levers:

1. **Celo fee abstraction** — Celo natively allows paying gas in whitelisted ERC‑20s (incl. stables), removing the "buy the gas token" wall.
2. **ERC‑4337 smart accounts + paymaster** — Owo sponsors gas for onboarding and first actions via a paymaster; embedded/social-login wallets create a smart account behind the scenes for non-crypto-native users. Reown AppKit (already used by the GoodDollar SDKs) handles connection; an embedded-wallet provider handles key custody for users who don't bring a wallet.

This is the single biggest UX lever for Nigerian retail adoption — budget real time for it (see Sprint 2).

### 4.5 Audit & deployment posture

- Foundry test suite with fuzzing + invariant tests (e.g., "sum of escrowed balances == contract G$ balance", "no trade releases without payment attestation").
- Internal review → testnet (Celo Alfajores) → **external audit before mainnet treasury goes live** → guarded mainnet launch with low caps that ratchet up.

---

## 5. Off-chain backend services

All Node.js + TypeScript, event-driven (a message bus / job queue between services). Start as a modular monolith (one deployable, clear module boundaries) and split only where scale demands — do **not** start as 9 microservices.

| Service                 | Responsibility                                                                                                                            | Notes                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Identity/KYC**        | GoodDollar uniqueness check + tiered KYC (NIN/BVN, liveness) + sanctions screening. Stores _references_, not raw documents in the app DB. | Two-layer model (§9).                                                |
| **Matching engine**     | Maintains the live order book in Redis; matches sell↔buy by price/amount/limits; falls back to Treasury.                                  | Deterministic, idempotent matches; locks via Redis.                  |
| **Orders/Trades**       | Trade lifecycle, state transitions, deadlines, dispute records. Mirrors `OwoEscrow` state.                                                | Source of truth for UX; chain is source of truth for funds.          |
| **Payout orchestrator** | Initiates and tracks Naira payouts to sellers; verifies buyer→seller Naira receipt for releases. Adapter per PSP.                         | Idempotent; reconciled daily.                                        |
| **Spend/Biller**        | Airtime/data/electricity purchase against G$; adapter per VTU aggregator.                                                                 | Quote → debit G$ → fulfill → confirm; auto-refund on biller failure. |
| **Ledger**              | Append-only double-entry ledger of every value movement (G$ and Naira).                                                                   | The financial source of truth (§6).                                  |
| **Treasury/Liquidity**  | Off-chain brain for `OwoTreasury`: inventory, pricing, rebalancing, hedging policy.                                                       | Reads oracles + book; signs treasury txs via KMS.                    |
| **Indexer**             | Subscribes to Celo events (escrow, treasury, rewards, G$ transfers) → updates backend state.                                              | Ponder or a Viem `watchEvent` worker; handles reorgs.                |
| **Reconciliation**      | Nightly 3-way reconcile: chain balances ↔ ledger ↔ bank/PSP statements. Flags drift.                                                      | Hard gate for production.                                            |
| **Webhook router**      | Verifies + dedupes inbound webhooks (PSP, biller, KYC) with signature checks and idempotency keys.                                        | Never trust an unsigned webhook.                                     |
| **Rewards**             | Issues Engagement Rewards for qualifying actions; anti-abuse gating via uniqueness.                                                       | On-chain grant via `OwoRewards`.                                     |
| **Notifications**       | SMS/WhatsApp/push for trade status, payout sent, low-data friendly.                                                                       | Critical for trust on patchy networks.                               |
| **Admin/Ops**           | Internal console: disputes, KYC review, treasury controls, kill-switches.                                                                 | RBAC + audit log on every action.                                    |

---

## 6. Data model & the ledger

### 6.1 Core entities (PostgreSQL)

- `users` — id, smart-account address, GoodDollar uniqueness status, KYC tier, risk flags.
- `kyc_records` — vendor refs, tier, sanctions result, expiry. (No raw PII docs in app DB; encrypted object store + references.)
- `orders` — side (buy/sell), amount G$, price, limits, status, expiry.
- `trades` — matched order pair, on-chain escrow id, state, deadlines, dispute id.
- `payouts` — Naira leg: PSP ref, beneficiary, amount, status, idempotency key.
- `spend_txns` — biller purchases: product, G$ debited, biller ref, status.
- `ledger_entries` — the double-entry book (below).
- `rewards` — action, user, amount, on-chain tx, anti-abuse decision.
- `treasury_movements` — inventory in/out, rebalances, hedges.

### 6.2 Double-entry ledger

Every movement is ≥2 entries that sum to zero per currency. Example — a P2P sell where Owo takes a 1% fee in G$:

```
Trade #T123  (seller sells 1000 G$ for ₦X, fee 10 G$)
  ── G$ book ──
  escrow_in           +1000 G$   (seller → escrow)
  buyer_out           −990  G$   (escrow → buyer)
  fee_revenue         −10   G$   (escrow → treasury)
  ── Naira book ──
  buyer_naira_out     −X ₦       (buyer pays seller)
  seller_naira_in     +X ₦
```

The ledger is the _truth_ the Reconciliation service checks against both the chain (G$ side) and PSP statements (Naira side). Drift > tolerance → auto-pause + alert.

---

## 7. Key flows (sequence walkthroughs)

### 7.1 Onboarding + verification

1. User opens PWA / MiniPay mini-app → connects or gets an embedded smart account.
2. **GoodDollar uniqueness:** check Identity contract via `@goodsdks/identity-sdk` (`useIdentitySDK`); if not verified, route through GoodDollar face verification (FaceTec) flow.
3. **KYC tier 0 → 1:** for any Naira leg, collect NIN/BVN + liveness via KYC vendor; sanctions screen. Tier gates limits (§9).
4. User lands on a **Spend-first home**: "Buy airtime / data / pay a merchant" primary; "Sell G$ for Naira" secondary.

### 7.2 P2P sell — G$ → Naira (cash-out valve)

1. Seller creates a sell order (amount, min price). Funds escrow via `transferAndCall` → `OwoEscrow.FUNDED`.
2. Matching engine pairs a buyer (or Treasury) → `LOCKED`, buyer has a deadline to pay Naira.
3. Buyer pays seller's Naira destination through Owo's PSP flow; Payout/Webhook verifies receipt.
4. Confirmation signer co-signs `release()` → buyer receives G$ minus fee; fee → Treasury. Ledger writes both legs. Seller notified.
5. **Unhappy paths:** buyer doesn't pay → `refund()` after timeout; dispute → arbiter window; PSP delay → trade held, not released.

### 7.3 P2P buy — Naira → G$ (feeds the spend rail)

Mirror of 7.2 with Treasury as default counterparty when peer sellers are thin — so a buyer who wants G$ _to spend on airtime_ always gets filled.

### 7.4 Spend — airtime/data with G$ (the primary path)

1. User picks product (e.g., ₦500 MTN data) → Spend service quotes G$ amount (oracle-priced).
2. User authorizes a single gasless tx debiting G$ (to Treasury/settlement address).
3. Biller adapter fulfills via VTU aggregator; on success, confirm + receipt; **on biller failure, auto-refund G$**. Ledger writes both legs.

### 7.5 Engagement reward

On first successful spend or a referral's first spend, Rewards service runs anti-abuse checks (uniqueness, device/risk) → grants G$ via `OwoRewards`. Bounded per-user, fraud-gated.

---

## 8. Wallet, keys & custody

- **User funds:** non-custodial smart accounts. Owo cannot move user G$ except through escrow logic the user initiated.
- **Embedded wallets:** for non-crypto-native users, key shares managed by an embedded-wallet provider (social/passkey login) — Owo never holds the full key.
- **Backend signers (segregated, least privilege):**
  - _Confirmation signer_ (escrow release) — KMS/HSM-backed, can only call `release()`/`refund()` within policy, rate-limited.
  - _Treasury signer_ — proposes; **principal moves require multisig**.
  - _Paymaster signer_ — sponsors gas only, holds minimal funds.
- **Cold/admin:** Safe multisig for treasury principal, contract upgrades/pauses, and reward minting authority.
- **Distribution lever:** ship Owo as a **MiniPay mini-app** (Opera MiniPay is a Celo wallet with very large West-African reach) to meet users where they already hold value — a major, low-cost acquisition channel for Nigeria.

---

## 9. Identity, KYC & AML (two layers — do not conflate)

| Layer                     | Question it answers                       | Tool                                                                  | What it is **not**                                                              |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **GoodDollar uniqueness** | "Is this one unique human (not a Sybil)?" | Identity contract + face verification (FaceTec), via Identity SDK     | _Not_ regulatory KYC; facial data is privacy-preserving and not an ID document. |
| **Regulatory KYC/AML**    | "Who is this person, for Naira AML?"      | NIN/BVN + liveness (e.g., a Nigerian KYC vendor), sanctions screening | _Not_ a substitute for uniqueness; needed only where fiat moves.                |

**Tiering (illustrative — set real numbers with compliance):**

- **Tier 0 (uniqueness only):** can earn/spend G$ on the rail up to a low daily cap; no fiat off-ramp.
- **Tier 1 (NIN/BVN + liveness):** P2P cash-out enabled up to mid daily/monthly limits.
- **Tier 2 (enhanced):** higher limits; enhanced due diligence + ongoing monitoring.

AML controls: velocity limits, structuring detection, sanctions/PEP screening, suspicious-activity workflow, full audit trail, configurable per-tier limits.

---

## 10. Security & risk engineering

- **Smart contracts:** Foundry fuzz + invariant tests; external audit before mainnet treasury; pausability + timelocked admin; conservative caps that ratchet; bug-bounty post-launch.
- **Funds safety:** custody-light escrow; segregated least-privilege signers; multisig for principal; no pooled balance a single trade can drain.
- **Fraud/Sybil:** uniqueness-gated rewards and limits; device + behavioral risk scoring; chargeback/payment-reversal handling on the Naira side (a real attack vector — design holdbacks and reversal windows).
- **App security:** SIWE sessions, strict authz (RBAC), input validation, signed webhooks, secrets in a manager (not env files in prod), dependency scanning, rate limits + WAF at the edge.
- **Operational:** kill-switches per surface (spend, P2P, treasury) so you can degrade gracefully; on-call alerts on reconciliation drift; immutable audit logs on every ops action.

---

## 11. Compliance & regulatory (Nigeria) — engineering posture

- **Don't be the bank.** Move Naira through **licensed payment partners** and keep their compliance perimeter intact; Owo orchestrates, partners settle.
- **Custody minimization** lowers regulatory surface — lean into non-custodial escrow.
- **Recordkeeping & reporting:** retain KYC, transaction, and SAR-ready records; build the audit trail from day one, not retrofitted.
- **Data protection (NDPA):** lawful basis, data minimization, encryption at rest/in transit, retention limits, deletion workflow; keep biometric uniqueness (GoodDollar side) separate from PII.
- **Posture statement for reviewers/partners:** Owo is a spendability/circulation layer; the fiat legs run through regulated rails; G$ does not exit the ecosystem in aggregate.

---

## 12. Infrastructure & DevOps

- **Environments:** local → staging (Celo Alfajores) → production (Celo mainnet). Separate keys, contracts, and data per env.
- **Hosting:** containerized services; start on a fast PaaS (e.g., Render/Railway/Fly) for velocity, with a clear path to AWS/GCP for production hardening. Managed Postgres + managed Redis.
- **CI/CD:** GitHub Actions — lint, typecheck, contract tests (Foundry), unit/integration tests, preview deploys, gated mainnet contract deploys behind manual approval.
- **Observability:** structured logging, error tracking (Sentry), metrics/dashboards (Prometheus/Grafana or hosted APM), uptime + reconciliation alerts. **A "money dashboard"** (GMV, payouts pending, treasury inventory, reconciliation status) is a first-class deliverable, not an afterthought.
- **Secrets & keys:** secrets manager; signer keys in KMS/HSM; Safe multisig for principal/admin.
- **IaC:** Terraform once production infra stabilizes (Month 4).

---

## 13. Tech stack summary

| Layer      | Choice                                                                                                                                                       | Why                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Contracts  | Solidity + Foundry + OpenZeppelin, Celo                                                                                                                      | Matches G$/Celo; best-in-class testing/fuzzing.      |
| Chain libs | Viem + Wagmi                                                                                                                                                 | Same stack the GoodDollar SDKs use → least friction. |
| GoodDollar | `@goodsdks/identity-sdk` / `citizen-sdk`, `@goodsdks/ui-components`, PaymentSDK, (Engagement Rewards SDK — confirm current package in the GoodSDKs monorepo) | Identity, claim UI, payment links, rewards.          |
| Wallet/AA  | Reown AppKit + ERC‑4337 paymaster + embedded wallets; Celo fee abstraction                                                                                   | Gasless, non-custodial, onboard non-crypto users.    |
| Frontend   | React + Vite **PWA**, TypeScript, Tailwind; MiniPay mini-app build                                                                                           | Low-end Android reach; native distribution channel.  |
| Backend    | Node.js + TypeScript (NestJS or Fastify), modular monolith                                                                                                   | One team, fast iteration, clean module seams.        |
| Data       | PostgreSQL + Redis + encrypted object store                                                                                                                  | Ledger/orders; queues/match-book/locks; KYC docs.    |
| Jobs/bus   | BullMQ (Redis) or NATS                                                                                                                                       | Payouts, webhooks, reconciliation, indexing.         |
| Indexer    | Ponder or Viem event worker                                                                                                                                  | Chain → backend state, reorg-safe.                   |
| Providers  | Payout PSP adapter, VTU/biller adapter, KYC vendor adapter                                                                                                   | Swappable; never single-vendor-locked.               |
| Infra      | Docker, GitHub Actions, PaaS→cloud, Terraform (later)                                                                                                        | Velocity now, hardening later.                       |

---

## 14. The 4-month plan (8 sprints × 2 weeks)

**Cadence:** 2-week sprints, each with a demo and hard **exit criteria**. Mapped to GoodBuilders milestones **M1** (P2P MVP), **M2** (spend rail), **M3** (engagement rewards), **M4** (merchant + production). Demo-day-ready artifact at the end of each month.

> Reality check for one builder: this plan is aggressive. The two line items most likely to slip are **account abstraction/gasless (Sprint 2)** and the **external audit (Month 4)** — protect both. If you must cut, cut merchant acceptance (§7 phase 3), not security.

---

### MONTH 1 — Foundations & identity _(scratch)_

**Sprint 1 — Skeleton & rails-of-the-rails**

- Monorepo (Turborepo + pnpm): `apps/web`, `apps/api`, `packages/contracts`, `packages/sdk`, `packages/ui`.
- CI/CD, env scaffolding (local + Alfajores), secrets manager, error tracking.
- Wagmi/Viem + Reown AppKit wired; connect wallet; read G$ balance on Celo.
- Postgres schema v0 (users, ledger skeleton), Redis up.
- _Exit:_ a deployed staging app where a user connects a wallet and sees their real G$ balance; CI green; ledger writes a test double-entry.

**Sprint 2 — Identity, KYC & gasless**

- Integrate `@goodsdks/identity-sdk`: detect uniqueness, route to face verification.
- Embedded smart-account onboarding + paymaster (gasless first tx); Celo fee-abstraction spike.
- KYC vendor adapter (NIN/BVN + liveness) behind an interface; Tier 0/1 logic; sanctions screen stub.
- _Exit:_ a new non-crypto user onboards with no CELO, passes uniqueness, completes Tier 1 KYC, and lands on the Spend-first home. **This sprint de-risks the hardest UX problem — guard its time.**

_Month 1 demo:_ "From zero to a verified, gasless, identity-checked Nigerian user."

---

### MONTH 2 — P2P marketplace MVP _(M1 → closed beta)_

**Sprint 3 — `OwoEscrow` + trade lifecycle**

- Build/test `OwoEscrow` (Foundry: unit, fuzz, invariants); deploy to Alfajores.
- Orders/Trades service + Redis order book; create/fund/cancel/refund flows end-to-end on testnet.
- Indexer watching escrow events → backend state.
- _Exit:_ a seller can fund escrow and get an automatic refund on timeout, entirely on testnet, reflected in ledger + UI.

**Sprint 4 — Matching, Naira payout & release**

- Matching engine (peer↔peer) with deadlines + locks.
- Payout orchestrator + PSP adapter (sandbox): verify buyer→seller Naira, then confirmation-signer `release()`.
- Dispute record + basic arbiter (multisig) path; notifications (SMS/WhatsApp).
- _Exit:_ a **full P2P sell (G$→Naira) completes end-to-end on testnet + sandbox PSP**, with the fee routed to treasury and a clean 3-way ledger entry. → **M1 done.**

_Month 2 demo:_ a live P2P trade, start to finish, with the circular framing on screen. Begin a **closed beta** with a handful of real GoodDollar users (small caps, real Naira, supervised).

---

### MONTH 3 — Spend rail + rewards _(M2 + M3 → public beta)_

**Sprint 5 — Spend rail v1 (airtime + data)**

- Spend/Biller service + VTU aggregator adapter (sandbox → live).
- Quote → gasless G$ debit → fulfill → receipt; **auto-refund on biller failure**.
- Make Spend the default home action; cash-out demoted to secondary.
- _Exit:_ a user buys real airtime/data with G$ in production-sandbox; failure path auto-refunds and reconciles. → **M2 done.**

**Sprint 6 — Engagement Rewards + growth loops**

- `OwoRewards` + Rewards service: first-spend bonus, referral bonus, uniqueness-gated anti-abuse.
- Referral mechanics + shareable links; basic growth analytics (activation, D1/D7 return, referral K).
- _Exit:_ a referred user's first spend triggers a bounded, fraud-checked G$ reward to both parties, on-chain and in-ledger. → **M3 done.**

_Month 3 demo:_ "Spend your G$, bring a friend, both get rewarded." Open a **public beta** (still capped) to a Nigerian user cohort + GoodDollar community/ambassadors.

---

### MONTH 4 — Treasury, hardening & production _(M4 → launch)_

**Sprint 7 — Treasury, electricity & merchant pilot**

- `OwoTreasury` live on testnet → guarded mainnet: buy-of-last-resort + buyer/merchant supply; on-chain caps + pause; off-chain pricing/rebalancing/hedging policy.
- Add electricity biller; onboard a **tiny** merchant pilot (batched G$ settlement) — controlled, not scaled.
- _Exit:_ marketplace fills buyer demand even with no peer sellers (treasury backstop), within caps. → **M4 core done.**

**Sprint 8 — Audit, reconciliation gate & production launch**

- External audit fixes merged; mainnet contracts deployed with low caps.
- Nightly 3-way reconciliation green for N consecutive days = production gate.
- Money dashboard, on-call alerts, kill-switches, runbooks, incident playbook.
- _Exit:_ **production launch** to Nigeria with real (capped) limits; reconciliation clean; rollback + pause tested.

_Month 4 / final demo day:_ a production circular G$ economy — spend, P2P, rewards, treasury-backed — with real users and live KPIs.

---

### Milestone ↔ sprint map

| GoodBuilders milestone                  | Sprints | Month |
| --------------------------------------- | ------- | ----- |
| Foundations + identity + gasless        | 1–2     | 1     |
| **M1** P2P marketplace MVP              | 3–4     | 2     |
| **M2** Spend rail v1                    | 5       | 3     |
| **M3** Engagement rewards               | 6       | 3     |
| **M4** Treasury + merchant + production | 7–8     | 4     |

---

## 15. KPIs & metrics (tie to Season 4 growth funding)

Season 4 streams funding against **real growth**, so instrument from Sprint 1.

- **Activation:** % of onboarded users who complete a first spend _or_ trade.
- **Retention:** D1 / D7 / D30 return rate; weekly active spenders.
- **GMV:** G$ volume through spend + P2P; Naira value settled.
- **Referral K-factor:** new users per existing user.
- **★ Circularity ratio:** share of G$ that is **re-spent inside Owo** vs **cashed out to Naira**. This is your signature metric — it directly evidences "G$ keeps circulating," the qualification thesis, and should trend up over the program.
- **Reliability:** payout success rate, biller success rate, reconciliation-clean days, dispute rate + resolution time.

Expose these on an internal dashboard _and_ keep a public-facing subset for QF/demo-day storytelling.

---

## 16. Team & roles (even if mostly solo)

Roles to cover; one person may wear several, but name the gaps:

- **Smart-contract** (you) — escrow/treasury/rewards + tests.
- **Backend** (you) — services, ledger, integrations.
- **Frontend/PWA** — mobile-first UX, MiniPay build. _(First hire/collaborator if you want speed.)_
- **Compliance/ops** — KYC/AML config, disputes, partner relationships. _(Advisory at minimum.)_
- **Security audit** — **external, non-negotiable**, booked early (long lead times).

Outsource the audit; consider a part-time frontend collaborator so Sprints 5–6 don't bottleneck on you.

---

## 17. Risks & mitigations

| Risk                                | Likelihood | Impact   | Mitigation                                                                   |
| ----------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------- |
| Gasless/AA harder than expected     | High       | High     | Time-boxed spike in Sprint 2; Celo fee abstraction as fallback to full 4337. |
| Thin buy-side demand (P2P stalls)   | High       | High     | Treasury backstop + spend rail gives buyers a _reason_ to want G$.           |
| Naira payment reversals/chargebacks | Med        | High     | Holdbacks, reversal windows, tiered limits, fraud scoring.                   |
| Micro-amount unit economics         | High       | Med      | Accumulation thresholds, batched payouts, fee floors.                        |
| Regulatory shift (CBN)              | Med        | High     | Licensed-partner rails, custody minimization, counsel on retainer.           |
| Audit/timeline slip                 | Med        | High     | Book audit in Month 3; cut merchant pilot before cutting security.           |
| Smart-contract exploit              | Low        | Critical | Audit, caps, pausability, multisig, bounty, invariant tests.                 |
| Vendor lock-in / outage             | Med        | Med      | Adapter interfaces for every PSP/biller/KYC; ≥2 options where feasible.      |

---

## 18. Appendices

### A. Suggested repo layout (Turborepo + pnpm)

```
owo/
├─ apps/
│  ├─ web/            # React + Vite PWA (+ MiniPay build target)
│  ├─ api/            # Node/TS modular monolith (services as modules)
│  └─ admin/          # ops console (disputes, KYC, treasury, kill-switches)
├─ packages/
│  ├─ contracts/      # Foundry: OwoEscrow, OwoTreasury, OwoRewards + tests
│  ├─ sdk/            # typed client for the API + chain helpers (Viem)
│  ├─ ledger/         # double-entry primitives
│  ├─ providers/      # PSP / biller / KYC adapters (interfaces + impls)
│  └─ ui/             # shared components, Owo design tokens
├─ infra/             # IaC, deploy, CI config
└─ docs/              # this doc, runbooks, ADRs
```

### B. Key GoodDollar / Celo references

- Identity SDK: `@goodsdks/identity-sdk` (and `@goodsdks/citizen-sdk`) — Viem/Wagmi, `useIdentitySDK`.
- UI: `@goodsdks/ui-components` (`<claim-button>`, Reown AppKit, Celo + Fuse).
- Payments: GoodDollar **PaymentSDK** (payment links / marketplace), ERC‑677 `transferAndCall`, OneTimePayments pattern.
- Engagement Rewards: in the **GoodSDKs** monorepo — confirm the current package name/version before integrating.
- G$ token + Identity contract on **Celo** (chainId 42220, RPC `https://forno.celo.org`); testnet **Alfajores**.
- Distribution: **MiniPay** mini-app (Celo) for West-African reach.

> Versions move — pin and re-verify package names/APIs against the live GoodDollar docs at integration time.

### C. Environment variables (illustrative)

```
# chain
CELO_RPC_URL=
CELO_CHAIN_ID=42220
GDOLLAR_TOKEN_ADDRESS=
IDENTITY_CONTRACT_ADDRESS=
OWO_ESCROW_ADDRESS=
OWO_TREASURY_ADDRESS=
OWO_REWARDS_ADDRESS=
# AA
PAYMASTER_URL=
BUNDLER_URL=
EMBEDDED_WALLET_KEY=
# signers (KMS refs, not raw keys)
CONFIRMATION_SIGNER_KMS=
TREASURY_SIGNER_KMS=
# providers
PSP_API_KEY= / PSP_WEBHOOK_SECRET=
BILLER_API_KEY= / BILLER_WEBHOOK_SECRET=
KYC_API_KEY=
SANCTIONS_API_KEY=
# infra
DATABASE_URL= / REDIS_URL=
SENTRY_DSN=
```

### D. Glossary

- **G$** — GoodDollar UBI token (ERC‑677 on Celo).
- **Uniqueness vs KYC** — GoodDollar proves one-human; KYC proves legal identity for fiat.
- **Circularity ratio** — % of G$ re-spent in Owo vs cashed out; Owo's north-star.
- **Backstop** — Treasury acting as counterparty of last resort.
- **AA / paymaster** — account abstraction; gas sponsorship so users hold no CELO.

---

_End of document — Owo Architecture & 4-Month Build Plan, v1._
