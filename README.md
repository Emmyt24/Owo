# Owo

A circular **G$ economy for Nigeria** — a spend rail (airtime, data, electricity,
merchant pay in G$) backed by a peer-to-peer G$/Naira marketplace, designed so G$
keeps circulating inside the ecosystem rather than leaking out. Built on Celo
(chainId 42220), where G$ lives as an ERC-677 token.

See [`docs/Owo_Architecture_4Month_Plan (1).md`](<docs/Owo_Architecture_4Month_Plan (1).md>) for the full architecture and build plan.

## Monorepo layout

```
apps/
  web/      React + Vite PWA (Wagmi/Viem + Reown AppKit, MiniPay-ready)
  api/      NestJS modular monolith (services as modules)
  admin/    Ops console (disputes, KYC, treasury, kill-switches)
packages/
  contracts/  Foundry: OwoEscrow, OwoTreasury, OwoRewards (+ fuzz/invariant tests)
  sdk/        Typed API client + Celo/Viem chain helpers
  ledger/     Double-entry ledger primitives
  providers/  Swappable PSP / biller / KYC adapter interfaces
  ui/         Shared React components + Owo design tokens
infra/      docker-compose (local Postgres + Redis), deploy/CI config
docs/       Architecture, runbooks, ADRs
```

## Prerequisites

- Node 20+, pnpm 10+
- [Foundry](https://book.getfoundry.sh/) (for `packages/contracts`)
- Docker (for local Postgres + Redis)

## Getting started

```bash
pnpm install
cp .env.example .env            # fill in values (Reown project id, G$ address, …)
docker compose -f infra/docker-compose.yml up -d   # Postgres + Redis

# contract deps (vendored under packages/contracts/lib, gitignored)
cd packages/contracts && forge install foundry-rs/forge-std --no-git \
  && forge install OpenZeppelin/openzeppelin-contracts --no-git && cd -

pnpm run dev                    # all apps (turbo)
```

## Common tasks

```bash
pnpm run build       # build everything (turbo)
pnpm run test        # JS/TS tests (vitest) across the workspace
pnpm run lint
pnpm run typecheck
pnpm --filter @owo/contracts test   # Foundry tests
```

## Environments

local → staging (**Celo Alfajores**) → production (**Celo mainnet**). Separate keys,
contracts, and data per environment. Mainnet contract deploys are gated behind manual
approval and an external audit (Section 4.5 / 12).
