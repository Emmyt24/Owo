import { describe, it, expect } from 'vitest';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  it('appends a balanced sample journal', () => {
    const svc = new LedgerService();
    const entry = svc.postSampleP2pSell();
    expect(entry.legs.length).toBeGreaterThanOrEqual(2);
    expect(svc.list()).toHaveLength(1);
  });

  it('is idempotent on idempotencyKey', () => {
    const svc = new LedgerService();
    const e = {
      idempotencyKey: 'dup',
      ref: { kind: 'adjustment' as const, id: '1' },
      occurredAt: '2026-01-01T00:00:00.000Z',
      legs: [
        { account: 'a', currency: 'GDOLLAR' as const, amount: 5n },
        { account: 'b', currency: 'GDOLLAR' as const, amount: -5n },
      ],
    };
    svc.post(e);
    svc.post(e);
    expect(svc.list()).toHaveLength(1);
  });
});
