import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

// API keys are hashed here (SHA-256) and persisted by the AITM API server via
// the internal keys endpoint. The plaintext key is returned to the caller once
// and never stored.
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await req.json();

  // Generate API key
  const keyId = crypto.randomUUID();
  const secret = crypto.randomBytes(24).toString('base64url');
  const apiKey = `aitm_${secret}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Store in backend
  const response = await fetch(`${API_URL}/api/internal/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
    body: JSON.stringify({
      id: keyId,
      userId,
      keyHash,
      keyPrefix: apiKey.slice(0, 12),
      name: name || 'Default',
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
  }

  // Return the full key ONCE - it won't be shown again
  return NextResponse.json({
    id: keyId,
    key: apiKey,
    prefix: apiKey.slice(0, 12) + '...',
    name: name || 'Default',
    createdAt: new Date().toISOString(),
  });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's keys from backend
  const response = await fetch(`${API_URL}/api/internal/keys?userId=${userId}`, {
    headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
  });

  if (!response.ok) {
    return NextResponse.json({ keys: [] });
  }

  const keys = await response.json();
  return NextResponse.json({ keys });
}
