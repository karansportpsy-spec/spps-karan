export type BillingMarket = 'india' | 'global';
export type BillingProductType = 'token_pack' | 'session_unlock';
export type BillingProvider = 'stripe' | 'razorpay';

export interface TokenPack {
  code: string;
  label: string;
  tokens: number;
  amountMinor: number;
  currency: 'INR' | 'USD';
}

export interface SessionUnlockProduct {
  market: BillingMarket;
  label: string;
  productType: 'session_unlock';
  productCode: string;
  quantity: number;
  amountMinor: number;
  currency: 'INR' | 'USD';
  tokensToCredit: number;
  tokenCost: number;
}

export interface BillingCatalog {
  market: BillingMarket;
  messageTokenCost: number;
  sessionTokenCost: number;
  tokenPacks: TokenPack[];
  sessionUnlock: SessionUnlockProduct;
}

export interface WalletSummary {
  wallet: {
    user_id: string;
    region: string;
    currency: string;
    balance_tokens: number;
    lifetime_credited: number;
    lifetime_debited: number;
    created_at: string;
    updated_at: string;
  };
  ledger: Array<{
    id: string;
    direction: 'credit' | 'debit';
    reason: string;
    quantity: number;
    idempotency_key: string;
    payment_order_id?: string | null;
    session_booking_id?: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface CheckoutRequest {
  market: BillingMarket;
  productType: BillingProductType;
  productCode: string;
  quantity?: number;
  practitionerUserId?: string;
  relationshipId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResponse {
  order: Record<string, unknown>;
  quote: {
    market: BillingMarket;
    productType: BillingProductType;
    productCode: string;
    quantity: number;
    currency: string;
    amountMinor: number;
    tokensToCredit: number;
    tokenCost: number;
    label: string;
  };
  provider: BillingProvider;
  checkoutUrl: string | null;
  checkoutPayload: Record<string, unknown>;
  razorpayKeyId: string | null;
}

export interface PractitionerAvailabilitySlotInput {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}

export interface AvailabilityResponse {
  practitionerUserId: string;
  date: string;
  slots: Array<{
    start: string;
    end: string;
    available: boolean;
  }>;
}

export interface SessionRequestInput {
  practitionerUserId: string;
  requestedStart?: string;
  requestedEnd?: string;
  note?: string;
}

export interface BookingConfirmationInput {
  practitionerUserId: string;
  relationshipId?: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone?: string;
  paymentOrderId?: string;
  useWallet?: boolean;
  note?: string;
}
