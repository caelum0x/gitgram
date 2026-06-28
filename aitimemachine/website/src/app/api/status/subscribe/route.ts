import { NextResponse } from 'next/server';
import { z } from 'zod';

// Incident-subscription delivery target. Configure this to a real provider
// webhook (e.g. an email list, a status-page provider's subscriber API, or an
// internal notifications endpoint). When unset, the route reports that the
// feature is not configured instead of silently dropping the subscription.
const SUBSCRIBE_WEBHOOK_URL = process.env.STATUS_SUBSCRIBE_WEBHOOK_URL;
const SUBSCRIBE_WEBHOOK_TOKEN = process.env.STATUS_SUBSCRIBE_WEBHOOK_TOKEN;

const subscribeSchema = z.object({
  email: z.string().trim().email(),
});

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
      { status: 400 }
    );
  }

  if (!SUBSCRIBE_WEBHOOK_URL) {
    return NextResponse.json(
      { error: 'Status notifications are not configured' },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(SUBSCRIBE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SUBSCRIBE_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${SUBSCRIBE_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        email: parsed.data.email,
        source: 'status_page',
        subscribedAt: new Date().toISOString(),
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to subscribe. Please try again later.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ subscribed: true, email: parsed.data.email });
  } catch {
    return NextResponse.json(
      { error: 'Subscription service is unavailable' },
      { status: 502 }
    );
  }
}
