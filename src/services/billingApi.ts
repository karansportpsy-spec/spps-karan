import { apiJson } from '@/lib/apiClient';
import type {
  BillingCatalog,
  CheckoutRequest,
  CheckoutResponse,
  WalletSummary,
} from '@/types/commerce';

export async function fetchBillingCatalog(market: 'india' | 'global' = 'india') {
  return apiJson<BillingCatalog>(`/api/billing/catalog?market=${encodeURIComponent(market)}`);
}

export async function fetchWalletSummary() {
  return apiJson<WalletSummary>('/api/wallet');
}

export async function createBillingCheckout(payload: CheckoutRequest) {
  return apiJson<CheckoutResponse>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function confirmPayment(payload: {
  provider: 'stripe' | 'razorpay';
  providerOrderId: string;
  providerPaymentId: string;
  signature?: string;
}) {
  return apiJson<{ order: Record<string, unknown> }>('/api/billing/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function startPayoutOnboarding(payload: {
  market: 'india' | 'global';
  refreshUrl: string;
  returnUrl: string;
  bankAccount?: {
    accountHolderName: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
  };
}) {
  return apiJson<{
    provider: 'stripe' | 'razorpay';
    onboardingStatus: string;
    onboardingUrl: string | null;
    nextStep?: string;
  }>('/api/payouts/onboard', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
