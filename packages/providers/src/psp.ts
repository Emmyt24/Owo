import type { AdapterInfo, Idempotent, InboundWebhook, WebhookVerification } from './common.js';

/** Status of a Naira payout leg, mirrored into the `payouts` table. */
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'reversed';

export interface NairaBeneficiary {
  bankCode: string;
  accountNumber: string;
  accountName?: string;
}

export interface InitiatePayout extends Idempotent {
  /** Amount in NGN minor units (kobo). */
  amount: bigint;
  beneficiary: NairaBeneficiary;
  /** Owo-side reference (trade id) carried through for reconciliation. */
  reference: string;
}

export interface PayoutResult {
  status: PayoutStatus;
  /** PSP-side reference. */
  pspRef: string;
}

export interface PayoutEvent {
  pspRef: string;
  reference: string;
  status: PayoutStatus;
}

/**
 * Naira payout rail. Owo orchestrates; the licensed PSP settles (Section 11).
 * Implementations must be idempotent on `idempotencyKey` and verify webhooks.
 */
export interface PspAdapter {
  readonly info: AdapterInfo;
  initiatePayout(req: InitiatePayout): Promise<PayoutResult>;
  getPayout(pspRef: string): Promise<PayoutResult>;
  /** Verify an inbound PSP webhook (signature + dedupe handled by caller). */
  verifyWebhook(hook: InboundWebhook): WebhookVerification<PayoutEvent>;
}
