import { Controller, Get, Post } from '@nestjs/common';
import type { JournalEntry } from '@owo/ledger';
import { LedgerService } from './ledger.service';

/** bigint amounts are serialized as decimal strings for JSON transport. */
function serialize(entry: JournalEntry) {
  return {
    ...entry,
    legs: entry.legs.map((leg) => ({ ...leg, amount: leg.amount.toString() })),
  };
}

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('entries')
  list() {
    return this.ledger.list().map(serialize);
  }

  /** Sprint 1 exit criterion: "ledger writes a test double-entry". */
  @Post('sample')
  postSample() {
    return serialize(this.ledger.postSampleP2pSell());
  }
}
