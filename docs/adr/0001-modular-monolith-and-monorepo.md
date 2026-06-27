# ADR 0001 — Modular monolith in a Turborepo monorepo

- Status: Accepted
- Date: 2026-06-27

## Context

Owo is built (initially) by a very small team and must ship a P2P MVP, a spend rail,
rewards, and a treasury backstop in four months (Section 14). The architecture names
12+ logical services (Section 5) but explicitly warns: "do **not** start as 9
microservices."

## Decision

- **Monorepo** with Turborepo + pnpm workspaces. Apps (`web`, `api`, `admin`) and
  shared packages (`contracts`, `sdk`, `ledger`, `providers`, `ui`) live together so
  contracts/types are shared and changes are atomic across the stack.
- **Backend is a modular monolith** (NestJS): each service from Section 5 is a Nest
  module with clear boundaries, one deployable. Split a module into its own service
  only when scale demands it.
- **Contracts** use Foundry for best-in-class fuzz/invariant testing (Section 13).

## Consequences

- Fast iteration and one CI pipeline; clean seams via Nest modules and workspace
  package boundaries make a later split low-cost.
- Shared `@owo/ledger`, `@owo/providers`, `@owo/sdk` enforce the "money is a ledger"
  and "providers are interfaces" principles across apps.
