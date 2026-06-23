import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization');
  const action = req.nextUrl.searchParams.get('action') || 'review';
  
  const res = await fetch(`${API_URL}/v1/moderation/queue?action=${action}`, {
    headers: { Authorization: token || '' },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
