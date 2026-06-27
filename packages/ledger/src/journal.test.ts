import { describe, it, expect } from 'vitest';
import { assertBalanced, p2pSellJournal, LedgerError, netByCurrency } from './journal.js';

describe('double-entry invariant', () => {
  it('accepts the §6.2 P2P sell example (balanced per currency)', () => {
    const entry = p2pSellJournal({
      tradeId: 'T123',
      idempotencyKey: 'T123:release',
      occurredAt: '2026-01-01T00:00:00.000Z',
      gdollarAmount: 1000n,
      gdollarFee: 10n,
      nairaAmount: 500_00n,
    });
    expect(() => assertBalanced(entry)).not.toThrow();
    expect(netByCurrency(entry.legs).get('GDOLLAR')).toBe(0n);
    expect(netByCurrency(entry.legs).get('NGN')).toBe(0n);
  });

  it('rejects a journal that does not net to zero', () => {
    expect(() =>
      assertBalanced({
        idempotencyKey: 'bad',
        ref: { kind: 'adjustment', id: '1' },
        occurredAt: '2026-01-01T00:00:00.000Z',
        legs: [
          { account: 'a', currency: 'GDOLLAR', amount: 100n },
          { account: 'b', currency: 'GDOLLAR', amount: -90n },
        ],
      }),
    ).toThrow(LedgerError);
  });

  it('requires at least two legs', () => {
    expect(() =>
      assertBalanced({
        idempotencyKey: 'single',
        ref: { kind: 'adjustment', id: '1' },
        occurredAt: '2026-01-01T00:00:00.000Z',
        legs: [{ account: 'a', currency: 'GDOLLAR', amount: 0n }],
      }),
    ).toThrow(LedgerError);
  });
});
