import { NextRequest, NextResponse } from 'next/server'
import {
  AITM_BASE_URL,
  aitmCookieOptions,
  errorResponse,
  readAitmToken,
} from '../_lib'

/**
 * GET — report whether an AITM credential is stored, without exposing it.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ connected: !!readAitmToken() })
}

/**
 * POST — validate the supplied AITM API key and, if valid, persist it in an
 * httpOnly cookie. The key is never returned to the client.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { apiKey?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  if (!apiKey) {
    return errorResponse('apiKey is required', 400)
  }

  // Validate the key by hitting an authenticated AITM endpoint.
  let valid = false
  try {
    const res = await fetch(`${AITM_BASE_URL}/restore/projects`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    })
    valid = res.ok
  } catch {
    return errorResponse('Could not reach the AITM service', 502)
  }

  if (!valid) {
    return errorResponse('Invalid AITM API key', 401)
  }

  const response = NextResponse.json({ connected: true })
  response.cookies.set(aitmCookieOptions().name, apiKey, aitmCookieOptions())
  return response
}

/**
 * DELETE — disconnect AITM by clearing the stored credential.
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ connected: false })
  response.cookies.set(aitmCookieOptions(0).name, '', aitmCookieOptions(0))
  return response
}
