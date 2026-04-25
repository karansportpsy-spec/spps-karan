import express from 'express';
import { z } from 'zod';

import { env } from '../env.js';
import { requireRoles } from '../middleware/auth.js';
import {
  getBillingCatalog,
  getWalletSummary,
  createBillingCheckout,
  markPaymentOrderPaid,
  verifyStripeWebhookSignature,
  verifyRazorpayWebhookSignature,
  verifyRazorpayClientSignature,
  createPractitionerPayoutOnboarding,
} from '../services/billing.js';

const checkoutSchema = z.object({
  market: z.enum(['india', 'global']).default('india'),
  productType: z.enum(['token_pack', 'session_unlock']),
  productCode: z.string().min(1),
  quantity: z.number().int().min(1).max(10).default(1),
  practitionerUserId: z.string().uuid().optional(),
  relationshipId: z.string().uuid().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const confirmSchema = z.object({
  provider: z.enum(['stripe', 'razorpay']),
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  signature: z.string().optional(),
});

const payoutSchema = z.object({
  market: z.enum(['india', 'global']).default('india'),
  refreshUrl: z.string().url(),
  returnUrl: z.string().url(),
  bankAccount: z
    .object({
      accountHolderName: z.string().min(2),
      bankName: z.string().min(2).optional(),
      accountNumber: z.string().min(6).optional(),
      ifscCode: z.string().min(4).optional(),
      upiId: z.string().min(3).optional(),
    })
    .optional(),
});

export function registerBillingWebhookRoutes(app) {
  app.post(
    `${env.apiBasePath}/billing/webhooks/stripe`,
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        const rawBody = req.body.toString('utf8');
        const event = verifyStripeWebhookSignature(rawBody, req.headers['stripe-signature']);

        if (event.type === 'checkout.session.completed') {
          const session = event.data?.object || {};
          await markPaymentOrderPaid({
            provider: 'stripe',
            providerOrderId: session.id,
            providerPaymentId: session.payment_intent || session.payment_status,
            providerEventId: event.id,
            providerPayload: event,
          });
        }

        res.status(200).json({ received: true });
      } catch (error) {
        console.error('[SPPS Billing] Stripe webhook failed:', error);
        res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid Stripe webhook.' });
      }
    }
  );

  app.post(
    `${env.apiBasePath}/billing/webhooks/razorpay`,
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        const rawBody = req.body.toString('utf8');
        const event = verifyRazorpayWebhookSignature(rawBody, req.headers['x-razorpay-signature']);

        if (event.event === 'payment.captured') {
          const payment = event.payload?.payment?.entity || {};
          await markPaymentOrderPaid({
            provider: 'razorpay',
            providerOrderId: payment.order_id,
            providerPaymentId: payment.id,
            providerEventId: payment.id,
            providerPayload: event,
          });
        }

        res.status(200).json({ received: true });
      } catch (error) {
        console.error('[SPPS Billing] Razorpay webhook failed:', error);
        res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid Razorpay webhook.' });
      }
    }
  );
}

export function registerBillingRoutes(app) {
  app.get(`${env.apiBasePath}/billing/catalog`, requireRoles('athlete', 'practitioner', 'admin'), (req, res) => {
    const market = req.query.market === 'global' ? 'global' : 'india';
    res.json(getBillingCatalog(market));
  });

  app.get(`${env.apiBasePath}/wallet`, requireRoles('athlete', 'practitioner', 'admin'), async (req, res) => {
    try {
      const summary = await getWalletSummary(req.user.id);
      res.json(summary);
    } catch (error) {
      console.error('[SPPS Billing] wallet fetch failed:', error);
      res.status(500).json({ message: 'Failed to fetch wallet summary.' });
    }
  });

  app.post(`${env.apiBasePath}/billing/checkout`, requireRoles('athlete'), async (req, res) => {
    try {
      const payload = checkoutSchema.parse(req.body);
      const successUrl = payload.successUrl || `${env.clientOrigin}/athlete/dashboard?checkout=success`;
      const cancelUrl = payload.cancelUrl || `${env.clientOrigin}/athlete/dashboard?checkout=cancelled`;

      const checkout = await createBillingCheckout({
        athleteUserId: req.user.id,
        practitionerUserId: payload.practitionerUserId || null,
        relationshipId: payload.relationshipId || null,
        market: payload.market,
        productType: payload.productType,
        productCode: payload.productCode,
        quantity: payload.quantity,
        successUrl,
        cancelUrl,
      });

      res.status(201).json(checkout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid checkout payload.', issues: error.issues });
      }
      console.error('[SPPS Billing] checkout creation failed:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create checkout.' });
    }
  });

  app.post(`${env.apiBasePath}/billing/confirm`, requireRoles('athlete'), async (req, res) => {
    try {
      const payload = confirmSchema.parse(req.body);

      if (payload.provider === 'razorpay') {
        verifyRazorpayClientSignature({
          orderId: payload.providerOrderId,
          paymentId: payload.providerPaymentId,
          signature: payload.signature,
        });
      }

      const order = await markPaymentOrderPaid({
        provider: payload.provider,
        providerOrderId: payload.providerOrderId,
        providerPaymentId: payload.providerPaymentId,
        providerPayload: { confirmedByClient: true },
      });

      res.json({ order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid billing confirmation payload.', issues: error.issues });
      }
      console.error('[SPPS Billing] client confirmation failed:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to confirm payment.' });
    }
  });

  app.post(`${env.apiBasePath}/payouts/onboard`, requireRoles('practitioner', 'admin'), async (req, res) => {
    try {
      const payload = payoutSchema.parse(req.body);
      const onboarding = await createPractitionerPayoutOnboarding({
        practitionerUserId: req.user.id,
        market: payload.market,
        refreshUrl: payload.refreshUrl,
        returnUrl: payload.returnUrl,
        bankAccount: payload.bankAccount,
      });
      res.status(201).json(onboarding);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid payout onboarding payload.', issues: error.issues });
      }
      console.error('[SPPS Billing] payout onboarding failed:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to start payout onboarding.' });
    }
  });
}
