import Link from 'next/link'
import type { ReactNode } from 'react'

interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  /** Emoji string or any custom node (e.g. an SVG icon). */
  icon?: ReactNode
  title: string
  description?: string
  action?: EmptyStateAction
}

export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface)] text-4xl ring-1 ring-[var(--border)]">
        {icon}
      </div>
      <h3 className="mb-2 text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      {description && (
        <p className="mb-6 max-w-sm text-[var(--foreground-secondary)]">{description}</p>
      )}
      {action && <EmptyStateActionButton action={action} />}
    </div>
  )
}

function EmptyStateActionButton({ action }: { action: EmptyStateAction }) {
  const className =
    'inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-6 py-2.5 font-semibold text-white transition-opacity hover:opacity-90'

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    )
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * Preset variants for common zero-states.
 * ------------------------------------------------------------------------- */

export function EmptyFeed({ action }: { action?: EmptyStateAction }) {
  return (
    <EmptyState
      icon="🌱"
      title="Your feed is empty"
      description="Follow developers and repositories to start seeing posts in your timeline."
      action={action ?? { label: 'Explore', href: '/explore' }}
    />
  )
}

export function EmptySearch({ query }: { query?: string }) {
  return (
    <EmptyState
      icon="🔍"
      title="No results found"
      description={
        query
          ? `We couldn't find anything matching "${query}". Try a different search.`
          : 'Try a different search term.'
      }
    />
  )
}

export function EmptyNotifications() {
  return (
    <EmptyState
      icon="🔔"
      title="You're all caught up"
      description="New likes, comments, and follows will show up here."
    />
  )
}

export function EmptyMessages({ action }: { action?: EmptyStateAction }) {
  return (
    <EmptyState
      icon="💬"
      title="No conversations yet"
      description="Start a conversation with a developer you follow."
      action={action}
    />
  )
}

export function EmptyRepos({ action }: { action?: EmptyStateAction }) {
  return (
    <EmptyState
      icon="📦"
      title="No repositories yet"
      description="Connect your GitHub account to showcase your repositories."
      action={action ?? { label: 'Connect GitHub', href: '/settings' }}
    />
  )
}
