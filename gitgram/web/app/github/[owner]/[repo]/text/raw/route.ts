import { NextResponse } from 'next/server'
import { buildRepoTextRawPath } from '@/utils/repositoryRouting'

interface GithubRepositoryTextRawRouteProps {
  params: {
    owner: string
    repo: string
  }
}

export function GET(
  request: Request,
  { params }: GithubRepositoryTextRawRouteProps,
) {
  const url = new URL(request.url)
  url.pathname = buildRepoTextRawPath(params.owner, params.repo)
  return NextResponse.redirect(url)
}
