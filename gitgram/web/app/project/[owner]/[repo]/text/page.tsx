import { redirect } from 'next/navigation'
import { buildRepoTextPath } from '@/utils/repositoryRouting'

interface ProjectRepositoryTextRedirectPageProps {
  params: {
    owner: string
    repo: string
  }
  searchParams?: Record<string, string | string[] | undefined>
}

export default function ProjectRepositoryTextRedirectPage({
  params,
  searchParams,
}: ProjectRepositoryTextRedirectPageProps) {
  const nextSearchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        nextSearchParams.append(key, item)
      }
      continue
    }

    if (value !== undefined) {
      nextSearchParams.set(key, value)
    }
  }

  const destination = buildRepoTextPath(params.owner, params.repo)
  const query = nextSearchParams.toString()
  redirect(query ? `${destination}?${query}` : destination)
}
