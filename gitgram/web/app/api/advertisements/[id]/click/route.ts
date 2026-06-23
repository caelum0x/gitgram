import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await fetch(`${API_URL}/v1/advertisements/${params.id}/click`, {
    method: 'POST',
  });
  return NextResponse.json({ success: true });
}
