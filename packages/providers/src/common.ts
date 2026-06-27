/**
 * Shared adapter primitives. "Providers are interfaces" (Section 2): payout rails,
 * VTU/billers, and KYC vendors all sit behind swappable adapters — never hard-coupled
 * to one vendor. "Idempotency everywhere": every money op carries an idempotency key
 * and must be safe to retry.
 */

/** Every external money operation is keyed so retries are safe. */
export interface Idempotent {
  idempotencyKey: string;
}

/** A signed inbound webhook to be verified before trust (Section 5, Webhook router). */
export interface InboundWebhook {
  rawBody: string;
  signatureHeader: string;
  receivedAt: string;
}

/** Result of verifying a webhook signature. */
export interface WebhookVerification<T = unknown> {
  valid: boolean;
  /** Parsed, trusted payload when `valid` is true. */
  event?: T;
}

/** Common adapter metadata so the orchestrators can log/route by vendor. */
export interface AdapterInfo {
  /** Stable vendor id, e.g. "psp:flutterwave", "vtu:reloadly", "kyc:smileid". */
  id: string;
  /** Whether this adapter is pointing at sandbox or live. */
  mode: 'sandbox' | 'live';
}
