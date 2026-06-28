import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Server-side AITM credential helpers.
 *
 * The AITM bearer token is stored in an httpOnly cookie so it is never readable
 * by client JavaScript (mitigating XSS exfiltration). All AITM read calls are
 * proxied through Next.js route handlers that attach this token server-side.
 */

export const AITM_COOKIE = 'gitgram_aitm_token'
export const AITM_BASE_URL =
  process.env.AITM_API_URL ||
  process.env.NEXT_PUBLIC_AITM_API_URL ||
  'https://timemachine-api.gitgram.app/v1'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

/** Read the stored AITM token (server-only). */
export function readAitmToken(): string | null {
  return cookies().get(AITM_COOKIE)?.value ?? null
}

/** Build the Set-Cookie options for the httpOnly AITM credential. */
export function aitmCookieOptions(maxAge: number = COOKIE_MAX_AGE) {
  return {
    name: AITM_COOKIE,
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  }
}

/** Standard JSON error envelope. */
export function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Perform a GET against the AITM API with the stored token.
 * Returns a NextResponse ready to send to the client.
 */
export async function proxyAitmGet(path: string): Promise<NextResponse> {
  const token = readAitmToken()
  if (!token) {
    return errorResponse('AITM is not connected', 401)
  }

  let res: Response
  try {
    res = await fetch(`${AITM_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // AITM requests are not cached — checkpoint/diff data changes frequently.
      cache: 'no-store',
    })
  } catch {
    return errorResponse('Could not reach the AITM service', 502)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      (data as { message?: string; error?: string }).message ??
      (data as { error?: string }).error ??
      'AITM request failed'
    return NextResponse.json({ error: message }, { status: res.status })
  }
  return NextResponse.json(data)
}
