/**
 * Creem payment adapter.
 *
 * Creem is a merchant-of-record that supports Turkey-based sellers, so it is the
 * portfolio-standard provider (bidstage + CalDesk) for GitGram's recruiter
 * placement fees. This mirrors the reviewed bidstage `lib/creem.ts` checkout
 * adapter: a configured one-time product anchors the checkout and `custom_price`
 * carries the exact fee computed by the talent billing engine. Price and
 * settlement are revalidated in the signed webhook before an entitlement is
 * granted.
 *
 * Secrets are read from the environment only — never hardcoded:
 *   CREEM_API_KEY, CREEM_PRODUCT_ID, CREEM_WEBHOOK_SECRET, CREEM_TEST_MODE.
 */

export interface CreemEnv {
  apiKey: string;
  productId: string;
  webhookSecret: string;
  testMode: boolean;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`${name} is not configured`);
  }
  return value.trim();
}

/**
 * Resolves and validates the Creem configuration. Reads fresh each call (no
 * module-level caching) so tests and hot config changes stay honest.
 */
export function creemEnv(): CreemEnv {
  return {
    apiKey: requiredEnv('CREEM_API_KEY'),
    productId: requiredEnv('CREEM_PRODUCT_ID'),
    webhookSecret: requiredEnv('CREEM_WEBHOOK_SECRET'),
    // Default to test mode unless explicitly disabled, matching bidstage.
    testMode: process.env.CREEM_TEST_MODE !== 'false',
  };
}

export function creemBaseUrl(testMode: boolean): string {
  return testMode ? 'https://test-api.creem.io' : 'https://api.creem.io';
}

export type CreemCheckoutStatus = 'pending' | 'processing' | 'completed' | 'expired';

export interface CreemCheckout {
  id: string;
  checkoutUrl: string;
  status: CreemCheckoutStatus;
}

export interface CreateCreemCheckoutInput {
  /** Our stable reference for this charge (the placement id). */
  requestId: string;
  /** Exact amount to charge, in cents (drives Creem custom_price). */
  amountCents: number;
  successUrl: string;
  metadata: Record<string, string | number>;
}

interface CreemCheckoutResponse {
  id?: unknown;
  checkout_url?: unknown;
  status?: unknown;
}

const CHECKOUT_STATUSES: CreemCheckoutStatus[] = ['pending', 'processing', 'completed', 'expired'];

/**
 * Opens a Creem checkout for a one-time placement/unlock fee. Returns the
 * provider checkout id + hosted checkout URL the recruiter is redirected to.
 */
export async function createCreemCheckout(
  input: Readonly<CreateCreemCheckoutInput>,
): Promise<CreemCheckout> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('Creem checkout amount must be a positive integer number of cents');
  }
  const env = creemEnv();
  const response = await fetch(`${creemBaseUrl(env.testMode)}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.apiKey,
    },
    body: JSON.stringify({
      product_id: env.productId,
      request_id: input.requestId,
      units: 1,
      custom_price: input.amountCents,
      success_url: input.successUrl,
      metadata: input.metadata,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });

  const body = (await response.json().catch(() => ({}))) as CreemCheckoutResponse;
  if (!response.ok) {
    throw new Error(`Creem checkout failed with status ${response.status}`);
  }
  if (
    typeof body.id !== 'string' ||
    typeof body.checkout_url !== 'string' ||
    !/^https:\/\//i.test(body.checkout_url) ||
    !CHECKOUT_STATUSES.includes(String(body.status) as CreemCheckoutStatus)
  ) {
    throw new Error('Creem returned an invalid checkout response');
  }
  return {
    id: body.id,
    checkoutUrl: body.checkout_url,
    status: body.status as CreemCheckoutStatus,
  };
}
