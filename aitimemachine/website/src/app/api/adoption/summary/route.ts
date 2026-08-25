import { NextResponse } from 'next/server';
import { parseAdoptionSummary } from '@/lib/adoption-evidence';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';

export async function GET() {
  try {
    const response = await fetch(`${API_URL}/v1/adoption/summary`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'unavailable', error: `Public evidence API returned HTTP ${response.status}` },
        { status: response.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const summary = parseAdoptionSummary(await response.json() as unknown);
    if (!summary) {
      return NextResponse.json(
        { status: 'unavailable', error: 'Public evidence API returned an invalid summary' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { status: 'unavailable', error: 'Public evidence API could not be reached' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
