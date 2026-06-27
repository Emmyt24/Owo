import type { AdapterInfo, Idempotent, InboundWebhook, WebhookVerification } from './common.js';

export type BillerProductType = 'airtime' | 'data' | 'electricity';
export type FulfillmentStatus = 'pending' | 'fulfilled' | 'failed';

export interface BillerProduct {
  type: BillerProductType;
  /** Operator/disco code, e.g. "MTN", "IKEDC". */
  operator: string;
  /** Vendor-specific product/plan id (e.g. a data bundle). */
  planId?: string;
}

export interface PurchaseRequest extends Idempotent {
  product: BillerProduct;
  /** Phone/meter the value lands on. */
  recipient: string;
  /** Face value in NGN minor units (kobo). */
  faceValue: bigint;
}

export interface PurchaseResult {
  status: FulfillmentStatus;
  billerRef: string;
  /** Token for electricity vends, when applicable. */
  token?: string;
}

export interface BillerEvent {
  billerRef: string;
  status: FulfillmentStatus;
}

/**
 * VTU / biller aggregator: airtime, data, electricity (§7.4). The Spend service
 * flow is quote -> debit G$ -> fulfill -> confirm, with auto-refund on failure.
 */
export interface BillerAdapter {
  readonly info: AdapterInfo;
  /** Returns the NGN face values / plans available for an operator. */
  listProducts(type: BillerProductType, operator: string): Promise<BillerProduct[]>;
  purchase(req: PurchaseRequest): Promise<PurchaseResult>;
  getPurchase(billerRef: string): Promise<PurchaseResult>;
  verifyWebhook(hook: InboundWebhook): WebhookVerification<BillerEvent>;
}
