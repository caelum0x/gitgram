import { redirect } from 'next/navigation'

export default function LegacyGitHubExplorePage() {
  redirect('/explore/repos')
}
