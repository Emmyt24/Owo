import { Injectable, BadRequestException } from '@nestjs/common';
import { assertBalanced, p2pSellJournal, LedgerError, type JournalEntry } from '@owo/ledger';

/**
 * Sprint 1 ledger service: validates and appends double-entry journals to an
 * in-memory append-only store. The persistent Postgres `ledger_entries` table and
 * the Reconciliation service arrive in later sprints; the validation contract here
 * is the same one they will enforce.
 */
@Injectable()
export class LedgerService {
  private readonly entries: JournalEntry[] = [];
  private readonly seen = new Set<string>();

  /** Append a balanced journal. Idempotent on `idempotencyKey`; re-posting is a no-op. */
  post(entry: JournalEntry): JournalEntry {
    try {
      assertBalanced(entry);
    } catch (err) {
      if (err instanceof LedgerError) throw new BadRequestException(err.message);
      throw err;
    }
    if (this.seen.has(entry.idempotencyKey)) {
      return this.entries.find((e) => e.idempotencyKey === entry.idempotencyKey)!;
    }
    this.seen.add(entry.idempotencyKey);
    this.entries.push(entry);
    return entry;
  }

  list(): JournalEntry[] {
    return [...this.entries];
  }

  /** Writes the §6.2 worked example — used by the Sprint 1 exit-criteria demo. */
  postSampleP2pSell(): JournalEntry {
    return this.post(
      p2pSellJournal({
        tradeId: `T${Date.now()}`,
        idempotencyKey: `sample:${Date.now()}`,
        occurredAt: new Date().toISOString(),
        gdollarAmount: 1000n,
        gdollarFee: 10n,
        nairaAmount: 500_00n,
      }),
    );
  }
}
