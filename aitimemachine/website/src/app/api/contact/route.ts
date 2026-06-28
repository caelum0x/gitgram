import { NextResponse } from 'next/server';
import { z } from 'zod';
import { internalPost } from '@/lib/internalApi';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email('A valid email is required').max(320),
  subject: z.string().trim().min(1, 'Subject is required').max(120),
  message: z.string().trim().min(1, 'Message is required').max(5000),
});

interface ContactResult {
  success: boolean;
  id: string;
}

/**
 * POST /api/contact
 * Public contact form. Validates input then forwards to the backend, which
 * delivers the message to support via the email service.
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid submission' },
      { status: 400 },
    );
  }

  const result = await internalPost<ContactResult>('/contact', parsed.data);
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to send your message. Please try again.' },
      { status: result.status },
    );
  }

  return NextResponse.json({ success: true });
}
