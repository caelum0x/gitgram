import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, proxyAitmGet } from '../_lib'

/** GET — diff between two checkpoints. Requires projectId, fromCheckpointId, toCheckpointId. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const fromCheckpointId = searchParams.get('fromCheckpointId')
  const toCheckpointId = searchParams.get('toCheckpointId')

  if (!projectId || !fromCheckpointId || !toCheckpointId) {
    return errorResponse('projectId, fromCheckpointId and toCheckpointId are required', 400)
  }

  const query = new URLSearchParams({ projectId, fromCheckpointId, toCheckpointId })
  return proxyAitmGet(`/time/diff?${query.toString()}`)
}
