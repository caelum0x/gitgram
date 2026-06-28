import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, proxyAitmGet } from '../../_lib'

/** GET — conversation context for a checkpoint. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { checkpointId: string } },
): Promise<NextResponse> {
  const checkpointId = params.checkpointId
  if (!checkpointId) {
    return errorResponse('checkpointId is required', 400)
  }
  return proxyAitmGet(`/context/${encodeURIComponent(checkpointId)}`)
}
