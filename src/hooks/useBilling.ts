import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  confirmPayment,
  createBillingCheckout,
  fetchBillingCatalog,
  fetchWalletSummary,
  startPayoutOnboarding,
} from '@/services/billingApi'
import type { BillingMarket, CheckoutRequest } from '@/types/commerce'

export function useBillingCatalog(market: BillingMarket = 'india') {
  return useQuery({
    queryKey: ['billing-catalog', market],
    queryFn: () => fetchBillingCatalog(market),
    staleTime: 5 * 60 * 1000,
  })
}

export function useWalletSummary(enabled = true) {
  return useQuery({
    queryKey: ['wallet-summary'],
    queryFn: fetchWalletSummary,
    enabled,
    staleTime: 60 * 1000,
  })
}

export function useBillingCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CheckoutRequest) => createBillingCheckout(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wallet-summary'] })
    },
  })
}

export function usePaymentConfirmation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: confirmPayment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wallet-summary'] })
    },
  })
}

export function usePayoutOnboarding() {
  return useMutation({
    mutationFn: startPayoutOnboarding,
  })
}
