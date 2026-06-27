import type { Currency, JournalEntry, LedgerLeg } from './types.js';

export class LedgerError extends Error {}

/** Per-currency net of a set of legs. A valid journal nets to 0 in every currency. */
export function netByCurrency(legs: LedgerLeg[]): Map<Currency, bigint> {
  const net = new Map<Currency, bigint>();
  for (const leg of legs) {
    net.set(leg.currency, (net.get(leg.currency) ?? 0n) + leg.amount);
  }
  return net;
}

/**
 * Validate the double-entry invariant: at least two legs, and the legs net to
 * exactly zero in each currency they touch. Throws {@link LedgerError} otherwise.
 */
export function assertBalanced(entry: JournalEntry): void {
  if (entry.legs.length < 2) {
    throw new LedgerError(`journal ${entry.idempotencyKey}: needs >= 2 legs`);
  }
  for (const [currency, sum] of netByCurrency(entry.legs)) {
    if (sum !== 0n) {
      throw new LedgerError(
        `journal ${entry.idempotencyKey}: ${currency} legs net to ${sum}, expected 0`,
      );
    }
  }
}

/** Convenience constructor that validates before returning. */
export function createJournalEntry(entry: JournalEntry): JournalEntry {
  assertBalanced(entry);
  return entry;
}

/**
 * Build the journal for a P2P sell with a G$ fee — the worked example from §6.2.
 * `feeAmount` and `payoutAmount` are in NGN minor units (kobo).
 */
export function p2pSellJournal(params: {
  tradeId: string;
  idempotencyKey: string;
  occurredAt: string;
  gdollarAmount: bigint;
  gdollarFee: bigint;
  nairaAmount: bigint;
}): JournalEntry {
  const { tradeId, idempotencyKey, occurredAt, gdollarAmount, gdollarFee, nairaAmount } = params;
  const toBuyer = gdollarAmount - gdollarFee;
  return createJournalEntry({
    idempotencyKey,
    ref: { kind: 'trade', id: tradeId },
    occurredAt,
    legs: [
      // G$ book
      {
        account: 'escrow_in',
        currency: 'GDOLLAR',
        amount: gdollarAmount,
        memo: 'seller -> escrow',
      },
      { account: 'buyer_out', currency: 'GDOLLAR', amount: -toBuyer, memo: 'escrow -> buyer' },
      {
        account: 'fee_revenue',
        currency: 'GDOLLAR',
        amount: -gdollarFee,
        memo: 'escrow -> treasury',
      },
      // Naira book
      {
        account: 'buyer_naira_out',
        currency: 'NGN',
        amount: -nairaAmount,
        memo: 'buyer pays seller',
      },
      { account: 'seller_naira_in', currency: 'NGN', amount: nairaAmount },
    ],
  });
}
