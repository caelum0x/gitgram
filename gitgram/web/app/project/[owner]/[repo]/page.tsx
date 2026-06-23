import { redirect } from 'next/navigation'
import { buildRepoPath } from '@/utils/repositoryRouting'

export default async function LegacyProjectRepositoryPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>
}) {
  const { owner, repo } = await params
  redirect(buildRepoPath(owner, repo))
}
