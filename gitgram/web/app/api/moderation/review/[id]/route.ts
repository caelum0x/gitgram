import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization');
  const body = await req.json();
  
  const res = await fetch(`${API_URL}/v1/moderation/review/${params.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token || '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
