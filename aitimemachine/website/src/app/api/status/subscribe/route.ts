import { NextResponse } from 'next/server';
import { z } from 'zod';
import { internalPost } from '@/lib/internalApi';

// Optional dedicated incident-subscription delivery target. When set (e.g. a
// status-page provider's subscriber API or a marketing list webhook), it takes
// precedence. When unset, the route falls back to the backend's notification
// endpoint so the subscribe form is functional out of the box.
const SUBSCRIBE_WEBHOOK_URL = process.env.STATUS_SUBSCRIBE_WEBHOOK_URL;
const SUBSCRIBE_WEBHOOK_TOKEN = process.env.STATUS_SUBSCRIBE_WEBHOOK_TOKEN;

const subscribeSchema = z.object({
  email: z.string().trim().email().max(320),
});

interface ContactResult {
  success: boolean;
  id: string;
}

/** Deliver via a dedicated provider webhook, if one is configured. */
async function deliverViaWebhook(email: string): Promise<boolean> {
  if (!SUBSCRIBE_WEBHOOK_URL) return false;
  const response = await fetch(SUBSCRIBE_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SUBSCRIBE_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${SUBSCRIBE_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      email,
      source: 'status_page',
      subscribedAt: new Date().toISOString(),
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Subscriber webhook responded with ${response.status}`);
  }
  return true;
}

/**
 * Fallback delivery: record the subscription request through the backend's
 * notification (contact) pipeline, which is backed by the email service. This
 * keeps the form working without a dedicated subscriber provider.
 */
async function deliverViaBackend(email: string): Promise<boolean> {
  const result = await internalPost<ContactResult>('/contact', {
    name: 'Status subscriber',
    email,
    subject: 'Status page incident subscription',
    message: `Please subscribe ${email} to status incident notifications.`,
  });
  return result.ok && Boolean(result.data?.success);
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'A valid email address is required' },
      { status: 400 },
    );
  }

  const { email } = parsed.data;

  try {
    const deliveredViaWebhook = await deliverViaWebhook(email);
    if (deliveredViaWebhook) {
      return NextResponse.json({ subscribed: true, email });
    }

    const deliveredViaBackend = await deliverViaBackend(email);
    if (!deliveredViaBackend) {
      return NextResponse.json(
        { error: 'Failed to subscribe. Please try again later.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ subscribed: true, email });
  } catch {
    return NextResponse.json(
      { error: 'Subscription service is unavailable' },
      { status: 502 },
    );
  }
}
