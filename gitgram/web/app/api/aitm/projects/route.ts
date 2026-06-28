import { NextResponse } from 'next/server'
import { proxyAitmGet } from '../_lib'

/** GET — list AITM projects for the connected credential. */
export async function GET(): Promise<NextResponse> {
  return proxyAitmGet('/restore/projects')
}
