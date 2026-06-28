import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, proxyAitmGet } from '../../../_lib'

/** GET — list checkpoints for an AITM project. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const projectId = params.id
  if (!projectId) {
    return errorResponse('Project id is required', 400)
  }
  return proxyAitmGet(`/restore/projects/${encodeURIComponent(projectId)}/checkpoints`)
}
