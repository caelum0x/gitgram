import { NextRequest, NextResponse } from 'next/server'
import {
  buildRepoTextExportSearchParams,
  normalizeRepoTextExportOptions,
} from '@/utils/repoTextExport'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      owner?: string
      name?: string
      username?: string
      repo?: string
    }>
  }
) {
  const params = await context.params
  const owner = params.owner ?? params.username
  const name = params.name ?? params.repo

  if (!owner || !name) {
    return NextResponse.json(
      { error: 'Repository owner and name are required.' },
      { status: 400 },
    )
  }
  const requestedUrl = new URL(request.url)
  const exportOptions = normalizeRepoTextExportOptions({
    maxFiles: requestedUrl.searchParams.get('maxFiles'),
    maxFileBytes: requestedUrl.searchParams.get('maxFileBytes'),
  })

  const upstreamUrl = new URL(
    `${API_URL}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/export/text`
  )
  const upstreamQuery = buildRepoTextExportSearchParams(exportOptions)
  upstreamQuery.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value)
  })

  const response = await fetch(upstreamUrl.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'text/plain, application/json;q=0.9, */*;q=0.8',
    },
  })

  const body = await response.text()
  const contentType = response.headers.get('content-type') || 'text/plain; charset=utf-8'
  const contentDisposition =
    response.headers.get('content-disposition') ||
    `inline; filename="${owner}-${name}-repo-to-text.txt"`

  return new NextResponse(body, {
    status: response.status,
    headers: {
      'content-type': contentType,
      'content-disposition': contentDisposition,
      'cache-control': 'no-store',
    },
  })
}
