/**
 * Ledger primitives. "Money is a ledger, not a number in a column" (Section 2):
 * every value movement is double-entry, append-only, and reconciled against
 * chain + bank truth. Amounts are integer minor units as `bigint` — never floats.
 */

/** Currencies the ledger tracks. G$ has 18 decimals on chain; NGN uses kobo (2 dp). */
export type Currency = 'GDOLLAR' | 'NGN' | 'CUSD' | 'USDC';

/**
 * A single leg of a journal entry. Positive = debit into the account,
 * negative = credit out of it. Per currency, all legs in a journal must net to zero.
 */
export interface LedgerLeg {
  /** Stable account identifier, e.g. "escrow_in", "buyer_out", "fee_revenue". */
  account: string;
  currency: Currency;
  /** Signed integer amount in minor units. */
  amount: bigint;
  /** Optional free-form tag for reconciliation/reporting. */
  memo?: string;
}

/**
 * An append-only journal entry: the atomic unit written to `ledger_entries`.
 * Each entry references the business object that produced it (trade/payout/spend/reward).
 */
export interface JournalEntry {
  /** Idempotency key — re-posting the same key must be a no-op (Section 2). */
  idempotencyKey: string;
  /** What produced this entry. */
  ref: { kind: 'trade' | 'payout' | 'spend' | 'reward' | 'treasury' | 'adjustment'; id: string };
  legs: LedgerLeg[];
  /** ISO-8601 timestamp; set by the caller for deterministic tests. */
  occurredAt: string;
}
