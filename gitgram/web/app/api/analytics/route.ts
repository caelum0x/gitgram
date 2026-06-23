import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization');
  const days = req.nextUrl.searchParams.get('days') || '30';
  const res = await fetch(`${API_URL}/v1/analytics?days=${days}`, {
    headers: { Authorization: token || '' },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
