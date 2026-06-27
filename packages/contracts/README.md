# @owo/contracts

Foundry workspace for Owo's on-chain layer on Celo.

| Contract      | Role                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| `OwoEscrow`   | Custody-light P2P escrow of the G$ leg of a trade (state machine §4.2).  |
| `OwoTreasury` | Liquidity float / counterparty-of-last-resort, multisig-governed (§4.3). |
| `OwoRewards`  | Auditable, idempotent on-chain Engagement Rewards grants (§4.1).         |

G$ is **not** redeployed — it is the existing ERC-677 GoodDollar token on Celo. `MockGoodDollar` exists only for tests.

## Commands

```bash
pnpm --filter @owo/contracts build      # forge build
pnpm --filter @owo/contracts test       # forge test -vv
pnpm --filter @owo/contracts test:ci    # fuzz + invariant profile
pnpm --filter @owo/contracts format     # forge fmt
```

## Dependencies

Installed under `lib/` (git metadata stripped, vendored): `forge-std`, `openzeppelin-contracts@5.6.1`.

## Deployment posture

Internal review → Alfajores → **external audit before mainnet treasury** → guarded mainnet
with low caps that ratchet up. Mainnet deploys are gated behind manual CI approval.

```bash
forge script script/Deploy.s.sol --rpc-url alfajores --broadcast
```
