import { NextResponse } from 'next/server'
import { buildRepoTextRawPath } from '@/utils/repositoryRouting'

interface ProjectRepositoryTextRawRouteProps {
  params: {
    owner: string
    repo: string
  }
}

export function GET(
  request: Request,
  { params }: ProjectRepositoryTextRawRouteProps,
) {
  const url = new URL(request.url)
  url.pathname = buildRepoTextRawPath(params.owner, params.repo)
  return NextResponse.redirect(url)
}
