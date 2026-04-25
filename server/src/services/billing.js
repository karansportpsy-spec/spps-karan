import crypto from 'crypto';

import { env } from '../env.js';
import { pool } from '../db.js';

export const MESSAGE_TOKEN_COST = env.messageTokenCost;
export const SESSION_TOKEN_COST = env.sessionTokenCost;

const TOKEN_PACKS = {
  india: [
    { code: 'starter_in', label: 'Starter', tokens: 50, amountMinor: 49900, currency: 'INR' },
    { code: 'growth_in', label: 'Growth', tokens: 120, amountMinor: 99900, currency: 'INR' },
    { code: 'elite_in', label: 'Elite', tokens: 320, amountMinor: 249900, currency: 'INR' },
  ],
  global: [
    { code: 'starter_global', label: 'Starter', tokens: 50, amountMinor: 999, currency: 'USD' },
    { code: 'growth_global', label: 'Growth', tokens: 120, amountMinor: 1999, currency: 'USD' },
    { code: 'elite_global', label: 'Elite', tokens: 320, amountMinor: 4999, currency: 'USD' },
  ],
};

const SESSION_UNLOCK_PRICING = {
  india: { amountMinor: 149900, currency: 'INR', tokens: SESSION_TOKEN_COST },
  global: { amountMinor: 2499, currency: 'USD', tokens: SESSION_TOKEN_COST },
};

function normalizeMarket(market) {
  return market === 'global' ? 'global' : 'india';
}

function createIdempotencyKey(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function providerRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? JSON.stringify(payload.error)
        : typeof payload === 'string'
          ? payload
          : `Provider request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function ensureWallet(client, userId, { region, currency }) {
  await client.query(
    `insert into token_wallets(user_id, region, currency)
     values ($1, $2, $3)
     on conflict (user_id) do nothing`,
    [userId, region, currency]
  );

  const result = await client.query(
    `select *
     from token_wallets
     where user_id = $1
     limit 1`,
    [userId]
  );
  return result.rows[0];
}

async function resolvePractitionerPayoutAccount(client, practitionerUserId) {
  if (!practitionerUserId) return null;
  const result = await client.query(
    `select *
     from practitioner_payout_accounts
     where practitioner_user_id = $1
     limit 1`,
    [practitionerUserId]
  );
  return result.rows[0] || null;
}

function getSessionUnlockQuote(market) {
  const key = normalizeMarket(market);
  const base = SESSION_UNLOCK_PRICING[key];
  return {
    market: key,
    label: 'Single session unlock',
    productType: 'session_unlock',
    productCode: `session_${key}`,
    quantity: 1,
    amountMinor: base.amountMinor,
    currency: base.currency,
    tokensToCredit: 0,
    tokenCost: base.tokens,
  };
}

export function getBillingCatalog(market = 'india') {
  const key = normalizeMarket(market);
  return {
    market: key,
    messageTokenCost: MESSAGE_TOKEN_COST,
    sessionTokenCost: SESSION_TOKEN_COST,
    tokenPacks: TOKEN_PACKS[key],
    sessionUnlock: getSessionUnlockQuote(key),
  };
}

export function buildCheckoutQuote({
  market = 'india',
  productType,
  productCode,
  quantity = 1,
}) {
  const key = normalizeMarket(market);

  if (productType === 'token_pack') {
    const pack = TOKEN_PACKS[key].find((entry) => entry.code === productCode);
    if (!pack) throw new Error('Unknown token pack selected.');

    return {
      market: key,
      productType,
      productCode: pack.code,
      quantity,
      currency: pack.currency,
      amountMinor: pack.amountMinor * quantity,
      tokensToCredit: pack.tokens * quantity,
      tokenCost: 0,
      label: `${pack.label} token pack`,
    };
  }

  if (productType === 'session_unlock') {
    const unlock = getSessionUnlockQuote(key);
    return {
      ...unlock,
      quantity,
      amountMinor: unlock.amountMinor * quantity,
      label: 'Session unlock',
    };
  }

  throw new Error('Unsupported billing product type.');
}

export async function getWalletSummary(userId) {
  const client = await pool.connect();
  try {
    const walletResult = await client.query(
      `select *
       from token_wallets
       where user_id = $1
       limit 1`,
      [userId]
    );

    const ledgerResult = await client.query(
      `select id, direction, reason, quantity, idempotency_key, payment_order_id, session_booking_id, metadata, created_at
       from token_ledger
       where wallet_user_id = $1
       order by created_at desc
       limit 25`,
      [userId]
    );

    const wallet = walletResult.rows[0] || {
      user_id: userId,
      region: 'india',
      currency: 'INR',
      balance_tokens: 0,
      lifetime_credited: 0,
      lifetime_debited: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      wallet,
      ledger: ledgerResult.rows,
    };
  } finally {
    client.release();
  }
}

export async function creditWallet({
  client,
  userId,
  quantity,
  reason,
  idempotencyKey,
  region = 'india',
  currency = 'INR',
  paymentOrderId = null,
  sessionBookingId = null,
  relatedUserId = null,
  metadata = {},
}) {
  if (quantity <= 0) {
    throw new Error('Wallet credit quantity must be positive.');
  }

  const existing = await client.query(
    `select id
     from token_ledger
     where wallet_user_id = $1
       and idempotency_key = $2
     limit 1`,
    [userId, idempotencyKey]
  );
  if (existing.rowCount > 0) {
    return;
  }

  await ensureWallet(client, userId, { region, currency });

  await client.query(
    `insert into token_ledger(
       wallet_user_id, direction, reason, quantity, idempotency_key,
       payment_order_id, session_booking_id, related_user_id, metadata
     )
     values ($1, 'credit', $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [userId, reason, quantity, idempotencyKey, paymentOrderId, sessionBookingId, relatedUserId, JSON.stringify(metadata)]
  );

  await client.query(
    `update token_wallets
     set balance_tokens = balance_tokens + $2,
         lifetime_credited = lifetime_credited + $2,
         last_credited_at = now(),
         updated_at = now()
     where user_id = $1`,
    [userId, quantity]
  );
}

export async function debitWallet({
  client,
  userId,
  quantity,
  reason,
  idempotencyKey,
  region = 'india',
  currency = 'INR',
  paymentOrderId = null,
  sessionBookingId = null,
  relatedUserId = null,
  metadata = {},
}) {
  if (quantity <= 0) {
    throw new Error('Wallet debit quantity must be positive.');
  }

  const existing = await client.query(
    `select id
     from token_ledger
     where wallet_user_id = $1
       and idempotency_key = $2
     limit 1`,
    [userId, idempotencyKey]
  );
  if (existing.rowCount > 0) {
    return;
  }

  const wallet = await ensureWallet(client, userId, { region, currency });
  if (Number(wallet.balance_tokens) < quantity) {
    throw new Error(`Insufficient tokens. ${quantity} tokens are required.`);
  }

  await client.query(
    `insert into token_ledger(
       wallet_user_id, direction, reason, quantity, idempotency_key,
       payment_order_id, session_booking_id, related_user_id, metadata
     )
     values ($1, 'debit', $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [userId, reason, quantity, idempotencyKey, paymentOrderId, sessionBookingId, relatedUserId, JSON.stringify(metadata)]
  );

  await client.query(
    `update token_wallets
     set balance_tokens = balance_tokens - $2,
         lifetime_debited = lifetime_debited + $2,
         updated_at = now()
     where user_id = $1`,
    [userId, quantity]
  );
}

async function createStripeCheckoutSession({
  orderId,
  quote,
  athleteUserId,
  practitionerUserId,
  successUrl,
  cancelUrl,
  payoutAccount,
}) {
  if (!env.stripeSecretKey) {
    throw new Error('Stripe is not configured.');
  }

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', orderId);
  params.set('metadata[order_id]', orderId);
  params.set('metadata[athlete_user_id]', athleteUserId);
  if (practitionerUserId) params.set('metadata[practitioner_user_id]', practitionerUserId);
  params.set('line_items[0][quantity]', String(quote.quantity));
  params.set('line_items[0][price_data][currency]', quote.currency.toLowerCase());
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(quote.amountMinor / quote.quantity)));
  params.set('line_items[0][price_data][product_data][name]', quote.label);

  if (quote.productType === 'session_unlock' && payoutAccount?.provider_account_id) {
    const feeAmount = Math.round(quote.amountMinor * 0.12);
    params.set('payment_intent_data[application_fee_amount]', String(feeAmount));
    params.set('payment_intent_data[transfer_data][destination]', payoutAccount.provider_account_id);
    params.set('payment_intent_data[metadata][relationship_session]', 'true');
  }

  const session = await providerRequest('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  return {
    providerOrderId: session.id,
    checkoutUrl: session.url,
    checkoutPayload: session,
  };
}

async function createRazorpayOrder({ orderId, quote, athleteUserId, practitionerUserId }) {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new Error('Razorpay is not configured.');
  }

  const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64');
  const order = await providerRequest('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: quote.amountMinor,
      currency: quote.currency,
      receipt: orderId,
      notes: {
        order_id: orderId,
        athlete_user_id: athleteUserId,
        practitioner_user_id: practitionerUserId || '',
        product_type: quote.productType,
        product_code: quote.productCode,
      },
    }),
  });

  return {
    providerOrderId: order.id,
    checkoutUrl: null,
    checkoutPayload: order,
  };
}

export async function createBillingCheckout({
  athleteUserId,
  practitionerUserId = null,
  relationshipId = null,
  market = 'india',
  productType,
  productCode,
  quantity = 1,
  successUrl,
  cancelUrl,
}) {
  const quote = buildCheckoutQuote({ market, productType, productCode, quantity });
  const provider = quote.currency === 'INR' ? 'razorpay' : 'stripe';
  const client = await pool.connect();

  try {
    await client.query('begin');
    await ensureWallet(client, athleteUserId, {
      region: normalizeMarket(market),
      currency: quote.currency,
    });

    const insertOrder = await client.query(
      `insert into payment_orders(
         athlete_user_id, practitioner_user_id, relationship_id, provider, status,
         product_type, product_code, quantity, currency, amount_minor, tokens_to_credit, metadata
       )
       values ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11::jsonb)
       returning *`,
      [
        athleteUserId,
        practitionerUserId,
        relationshipId,
        provider,
        productType,
        quote.productCode,
        quantity,
        quote.currency,
        quote.amountMinor,
        quote.tokensToCredit,
        JSON.stringify({
          market: normalizeMarket(market),
          tokenCost: quote.tokenCost,
          label: quote.label,
        }),
      ]
    );

    const order = insertOrder.rows[0];
    const payoutAccount = await resolvePractitionerPayoutAccount(client, practitionerUserId);

    const providerResult =
      provider === 'stripe'
        ? await createStripeCheckoutSession({
            orderId: order.id,
            quote,
            athleteUserId,
            practitionerUserId,
            successUrl,
            cancelUrl,
            payoutAccount,
          })
        : await createRazorpayOrder({
            orderId: order.id,
            quote,
            athleteUserId,
            practitionerUserId,
          });

    const updateOrder = await client.query(
      `update payment_orders
       set provider_order_id = $2,
           checkout_url = $3,
           checkout_payload = $4::jsonb,
           updated_at = now()
       where id = $1
       returning *`,
      [order.id, providerResult.providerOrderId, providerResult.checkoutUrl, JSON.stringify(providerResult.checkoutPayload)]
    );

    await client.query('commit');

    return {
      order: updateOrder.rows[0],
      quote,
      provider,
      checkoutUrl: providerResult.checkoutUrl,
      checkoutPayload: providerResult.checkoutPayload,
      razorpayKeyId: provider === 'razorpay' ? env.razorpayKeyId : null,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function markPaymentOrderPaid({
  provider,
  providerOrderId,
  providerPaymentId,
  providerEventId = null,
  providerPayload = {},
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');

    if (providerEventId) {
      await client.query(
        `insert into payment_webhook_events(provider, provider_event_id, payload, processed_at)
         values ($1, $2, $3::jsonb, now())
         on conflict (provider, provider_event_id) do nothing`,
        [provider, providerEventId, JSON.stringify(providerPayload)]
      );
    }

    const orderResult = await client.query(
      `select *
       from payment_orders
       where provider = $1
         and provider_order_id = $2
       limit 1
       for update`,
      [provider, providerOrderId]
    );

    if (orderResult.rowCount === 0) {
      throw new Error('Payment order not found.');
    }

    const order = orderResult.rows[0];
    if (order.status === 'paid') {
      await client.query('commit');
      return order;
    }

    const updateOrder = await client.query(
      `update payment_orders
       set status = 'paid',
           provider_payment_id = coalesce($2, provider_payment_id),
           paid_at = now(),
           updated_at = now(),
           checkout_payload = checkout_payload || $3::jsonb
       where id = $1
       returning *`,
      [order.id, providerPaymentId, JSON.stringify(providerPayload)]
    );

    if (Number(order.tokens_to_credit) > 0) {
      await creditWallet({
        client,
        userId: order.athlete_user_id,
        quantity: Number(order.tokens_to_credit),
        reason: 'token_purchase',
        idempotencyKey: `payment_credit_${order.id}`,
        region: order.metadata?.market === 'global' ? 'global' : 'india',
        currency: order.currency,
        paymentOrderId: order.id,
        relatedUserId: order.practitioner_user_id,
        metadata: {
          provider,
          productType: order.product_type,
          productCode: order.product_code,
        },
      });
    }

    await client.query('commit');
    return updateOrder.rows[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export function verifyStripeWebhookSignature(rawBody, signatureHeader) {
  if (!env.stripeWebhookSecret) {
    throw new Error('Stripe webhook secret is not configured.');
  }
  if (!signatureHeader) {
    throw new Error('Missing Stripe signature header.');
  }

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    })
  );
  const timestamp = parts.t;
  const expectedSignature = crypto
    .createHmac('sha256', env.stripeWebhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const provided = signatureHeader
    .split(',')
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!provided.includes(expectedSignature)) {
    throw new Error('Invalid Stripe webhook signature.');
  }

  return JSON.parse(rawBody);
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  if (!env.razorpayWebhookSecret) {
    throw new Error('Razorpay webhook secret is not configured.');
  }

  const expected = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');

  if (!signature) {
    throw new Error('Invalid Razorpay webhook signature.');
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error('Invalid Razorpay webhook signature.');
  }

  return JSON.parse(rawBody);
}

export function verifyRazorpayClientSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (!signature) {
    throw new Error('Invalid Razorpay payment signature.');
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error('Invalid Razorpay payment signature.');
  }
}

export async function createPractitionerPayoutOnboarding({
  practitionerUserId,
  market = 'india',
  refreshUrl,
  returnUrl,
  bankAccount,
}) {
  const key = normalizeMarket(market);
  const client = await pool.connect();

  try {
    await client.query('begin');

    if (key === 'global') {
      if (!env.stripeSecretKey) {
        throw new Error('Stripe is not configured for global payouts.');
      }

      const existing = await resolvePractitionerPayoutAccount(client, practitionerUserId);
      let providerAccountId = existing?.provider_account_id || null;

      if (!providerAccountId) {
        const params = new URLSearchParams();
        params.set('type', 'express');
        params.set('capabilities[transfers][requested]', 'true');

        const account = await providerRequest('https://api.stripe.com/v1/accounts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        providerAccountId = account.id;
      }

      const linkParams = new URLSearchParams();
      linkParams.set('account', providerAccountId);
      linkParams.set('refresh_url', refreshUrl);
      linkParams.set('return_url', returnUrl);
      linkParams.set('type', 'account_onboarding');

      const accountLink = await providerRequest('https://api.stripe.com/v1/account_links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: linkParams.toString(),
      });

      await client.query(
        `insert into practitioner_payout_accounts(
           practitioner_user_id, provider, provider_account_id, onboarding_status, metadata
         )
         values ($1, 'stripe', $2, 'pending', $3::jsonb)
         on conflict (practitioner_user_id) do update
           set provider = excluded.provider,
               provider_account_id = excluded.provider_account_id,
               onboarding_status = excluded.onboarding_status,
               metadata = excluded.metadata,
               updated_at = now()`,
        [practitionerUserId, providerAccountId, JSON.stringify({ refreshUrl, returnUrl })]
      );

      await client.query('commit');
      return {
        provider: 'stripe',
        onboardingStatus: 'pending',
        onboardingUrl: accountLink.url,
      };
    }

    const safeBankMetadata = bankAccount
      ? {
          accountHolderName: bankAccount.accountHolderName,
          bankName: bankAccount.bankName,
          accountNumberLast4: String(bankAccount.accountNumber || '').slice(-4),
          ifscCode: bankAccount.ifscCode,
          upiId: bankAccount.upiId,
        }
      : {};

    await client.query(
      `insert into practitioner_payout_accounts(
         practitioner_user_id, provider, onboarding_status, bank_account_last4, metadata
       )
       values ($1, 'razorpay', 'pending_kyc', $2, $3::jsonb)
       on conflict (practitioner_user_id) do update
         set provider = excluded.provider,
             onboarding_status = excluded.onboarding_status,
             bank_account_last4 = excluded.bank_account_last4,
             metadata = excluded.metadata,
             updated_at = now()`,
      [
        practitionerUserId,
        safeBankMetadata.accountNumberLast4 || null,
        JSON.stringify({
          ...safeBankMetadata,
          refreshUrl,
          returnUrl,
        }),
      ]
    );

    await client.query('commit');
    return {
      provider: 'razorpay',
      onboardingStatus: 'pending_kyc',
      onboardingUrl: null,
      nextStep: 'Collect KYC and linked bank details in the Razorpay Route onboarding flow.',
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function chargeMessageTokens({
  athleteUserId,
  practitionerUserId,
  relationshipId = null,
  metadata = {},
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await debitWallet({
      client,
      userId: athleteUserId,
      quantity: MESSAGE_TOKEN_COST,
      reason: 'message_send',
      idempotencyKey: createIdempotencyKey('message'),
      relatedUserId: practitionerUserId,
      metadata: {
        relationshipId,
        ...metadata,
      },
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
