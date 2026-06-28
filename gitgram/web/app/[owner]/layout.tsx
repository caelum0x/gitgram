import type { Metadata } from 'next'
import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  params: Promise<{ owner: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ owner: string }> }): Promise<Metadata> {
  const { owner: username } = await params
  return {
    title: `@${username} on Gitgram`,
    description: `View @${username}'s posts, projects, and GitHub profile on Gitgram.`,
    openGraph: {
      title: `@${username} on Gitgram`,
      description: `View @${username}'s posts, projects, and GitHub profile on Gitgram.`,
      url: `https://gitgram.app/${username}`,
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title: `@${username} on Gitgram`,
      description: `View @${username}'s posts, projects, and GitHub profile on Gitgram.`,
    },
  }
}

export default function UserProfileLayout({ children }: LayoutProps) {
  return <>{children}</>
}
