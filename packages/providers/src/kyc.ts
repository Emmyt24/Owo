import type { AdapterInfo, InboundWebhook, WebhookVerification } from './common.js';

/** KYC tier gating fiat limits (Section 9). Tier 0 = uniqueness only, no fiat. */
export type KycTier = 0 | 1 | 2;
export type KycDecision = 'pending' | 'approved' | 'rejected' | 'review';
export type SanctionsResult = 'clear' | 'hit' | 'pending';

export interface KycSubmission {
  /** Owo user id. */
  userId: string;
  tier: Exclude<KycTier, 0>;
  /** Nigerian identity inputs for the fiat AML layer. */
  nin?: string;
  bvn?: string;
  /** Reference to a liveness capture stored in the encrypted object store. */
  livenessRef?: string;
}

export interface KycResult {
  /** Vendor-side reference; only references are stored in the app DB (Section 6.1). */
  vendorRef: string;
  decision: KycDecision;
  tier: KycTier;
  sanctions: SanctionsResult;
  /** ISO date the verification expires and must be re-run. */
  expiresAt?: string;
}

export interface KycEvent {
  vendorRef: string;
  decision: KycDecision;
  sanctions: SanctionsResult;
}

/**
 * Regulatory KYC/AML vendor (NIN/BVN + liveness + sanctions). Distinct from the
 * GoodDollar uniqueness layer — do not conflate (Section 9). Stores references only.
 */
export interface KycAdapter {
  readonly info: AdapterInfo;
  submit(submission: KycSubmission): Promise<KycResult>;
  getResult(vendorRef: string): Promise<KycResult>;
  screenSanctions(fullName: string, dob?: string): Promise<SanctionsResult>;
  verifyWebhook(hook: InboundWebhook): WebhookVerification<KycEvent>;
}
