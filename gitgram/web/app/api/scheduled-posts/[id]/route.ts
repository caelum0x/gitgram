import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization');
  const res = await fetch(`${API_URL}/v1/scheduled-posts/${params.id}`, {
    method: 'DELETE',
    headers: { Authorization: token || '' },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
