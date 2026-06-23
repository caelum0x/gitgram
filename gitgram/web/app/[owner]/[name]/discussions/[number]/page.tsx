'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DiscussionState = 'open' | 'closed' | 'answered'

type DiscussionCategorySlug =
  | 'announcements'
  | 'ideas'
  | 'q-and-a'
  | 'show-and-tell'
  | 'general'

type VoteValue = 1 | 0 | -1

interface DiscussionAuthor {
  login: string
  avatarUrl: string | null
}

interface DiscussionReply {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  upvotes: number
  viewerVote: VoteValue
  isAnswer: boolean
  author: DiscussionAuthor
  children: DiscussionReply[]
}

interface DiscussionDetail {
  id: string
  number: number
  title: string
  state: DiscussionState
  category: DiscussionCategorySlug
  categoryLabel: string
  body: string
  locked: boolean
  upvotes: number
  viewerVote: VoteValue
  createdAt: string
  updatedAt: string
  author: DiscussionAuthor
  acceptedAnswerId: string | null
  replies: DiscussionReply[]
}

interface DiscussionDetailApiResponse {
  data: {
    discussion: DiscussionDetail
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<DiscussionCategorySlug, string> = {
  announcements: '📣',
  ideas: '💡',
  'q-and-a': '❓',
  'show-and-tell': '🎁',
  general: '🗨️',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface UserAvatarProps {
  login: string
  avatarUrl: string | null
  size?: number
}

function UserAvatar({ login, avatarUrl, size = 32 }: UserAvatarProps) {
  const src = avatarUrl ?? `https://github.com/${login}.png?size=${size * 2}`
  return (
    <img
      src={src}
      alt={login}
      width={size}
      height={size}
      className="rounded-full flex-shrink-0"
    />
  )
}

interface StateBadgeProps {
  state: DiscussionState
}

function StateBadge({ state }: StateBadgeProps) {
  const config: Record<
    DiscussionState,
    { label: string; cls: string }
  > = {
    open: { label: 'Open', cls: 'bg-green-950 text-green-400 ring-green-700' },
    answered: { label: 'Answered', cls: 'bg-blue-950 text-blue-400 ring-blue-700' },
    closed: {
      label: 'Closed',
      cls: 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] ring-[var(--border)]',
    },
  }
  const c = config[state]
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ring-1 ${c.cls}`}
    >
      {c.label}
    </span>
  )
}

interface CategoryBadgeProps {
  slug: DiscussionCategorySlug
  label: string
}

function CategoryBadge({ slug, label }: CategoryBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] ring-1 ring-[var(--border)]">
      <span aria-hidden>{CATEGORY_ICON[slug]}</span>
      {label}
    </span>
  )
}

interface MarkdownBodyProps {
  content: string
}

function MarkdownBody({ content }: MarkdownBodyProps) {
  // Simple markdown rendering: headings, lists, code blocks, paragraphs.
  // In a production app you would use remark/rehype or react-markdown.
  const lines = content.split('\n')
  const rendered: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        rendered.push(
          <pre
            key={key++}
            className="my-3 p-4 rounded-lg bg-[var(--background)] border border-[var(--border)] overflow-x-auto text-sm text-[var(--foreground)] font-mono"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>,
        )
        inCodeBlock = false
        codeLines = []
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    if (line.startsWith('## ')) {
      rendered.push(
        <h2 key={key++} className="text-lg font-semibold mt-4 mb-2 text-[var(--foreground)]">
          {line.slice(3)}
        </h2>,
      )
    } else if (line.startsWith('# ')) {
      rendered.push(
        <h1 key={key++} className="text-xl font-bold mt-4 mb-2 text-[var(--foreground)]">
          {line.slice(2)}
        </h1>,
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      rendered.push(
        <li key={key++} className="ml-4 list-disc text-[var(--foreground)]">
          {line.slice(2)}
        </li>,
      )
    } else if (line === '') {
      rendered.push(<div key={key++} className="my-2" />)
    } else {
      rendered.push(
        <p key={key++} className="text-[var(--foreground)] leading-relaxed">
          {line}
        </p>,
      )
    }
  }

  return <div className="prose-sm space-y-1">{rendered}</div>
}

interface VoteWidgetProps {
  upvotes: number
  viewerVote: VoteValue
  disabled: boolean
  onVote: (value: VoteValue) => void
  orientation?: 'vertical' | 'horizontal'
}

function VoteWidget({
  upvotes,
  viewerVote,
  disabled,
  onVote,
  orientation = 'vertical',
}: VoteWidgetProps) {
  const handleUp = useCallback(() => {
    onVote(viewerVote === 1 ? 0 : 1)
  }, [viewerVote, onVote])

  const handleDown = useCallback(() => {
    onVote(viewerVote === -1 ? 0 : -1)
  }, [viewerVote, onVote])

  const wrapper =
    orientation === 'vertical'
      ? 'flex flex-col items-center gap-1'
      : 'flex items-center gap-1'

  return (
    <div className={wrapper}>
      <button
        type="button"
        onClick={handleUp}
        disabled={disabled}
        aria-label="Upvote"
        title="Upvote"
        className={`p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          viewerVote === 1
            ? 'text-[var(--accent)] bg-green-950'
            : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.025 1.243a.75.75 0 0 1 .53.22l5.25 5.25a.75.75 0 0 1-1.06 1.06L9 4.03V14.25a.75.75 0 0 1-1.5 0V4.03L3.755 7.773a.75.75 0 1 1-1.06-1.06l5.25-5.25a.75.75 0 0 1 .08-.07Z" />
        </svg>
      </button>
      <span className="text-sm font-semibold text-[var(--foreground)] tabular-nums">
        {upvotes}
      </span>
      <button
        type="button"
        onClick={handleDown}
        disabled={disabled}
        aria-label="Downvote"
        title="Downvote"
        className={`p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          viewerVote === -1
            ? 'text-[var(--error)] bg-red-950'
            : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.976 14.757a.75.75 0 0 1-.53-.22l-5.25-5.25a.75.75 0 0 1 1.06-1.06L7 11.97V1.75a.75.75 0 0 1 1.5 0v10.22l3.745-3.743a.75.75 0 1 1 1.06 1.06l-5.25 5.25a.75.75 0 0 1-.08.07Z" />
        </svg>
      </button>
    </div>
  )
}

interface ReplyCardProps {
  reply: DiscussionReply
  owner: string
  name: string
  nested?: boolean
  canMarkAnswer: boolean
  isQAndA: boolean
  votingDisabled: boolean
  onVote: (replyId: string, value: VoteValue) => void
  onMarkAnswer: (replyId: string) => void
}

function ReplyCard({
  reply,
  owner,
  name,
  nested = false,
  canMarkAnswer,
  isQAndA,
  votingDisabled,
  onVote,
  onMarkAnswer,
}: ReplyCardProps) {
  return (
    <div className={nested ? 'ml-12' : ''}>
      <div className="flex gap-3">
        <Link href={`/${reply.author.login}`} className="flex-shrink-0">
          <UserAvatar login={reply.author.login} avatarUrl={reply.author.avatarUrl} size={36} />
        </Link>

        <div
          className={`flex-1 min-w-0 border rounded-lg overflow-hidden ${
            reply.isAnswer
              ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
              : 'border-[var(--border)]'
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-4 py-2 border-b border-[var(--border)] ${
              reply.isAnswer ? 'bg-green-950/40' : 'bg-[var(--surface)]'
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              <Link
                href={`/${reply.author.login}`}
                className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
              >
                {reply.author.login}
              </Link>
              <span className="text-[var(--foreground-secondary)]">replied</span>
              <time
                className="text-[var(--foreground-secondary)]"
                title={formatDate(reply.createdAt)}
              >
                {timeAgo(reply.createdAt)}
              </time>
              {reply.updatedAt !== reply.createdAt && (
                <span className="text-[var(--foreground-secondary)] text-xs">(edited)</span>
              )}
            </div>

            {reply.isAnswer && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
                Answer
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-4 py-3 bg-[var(--surface)]">
            <MarkdownBody content={reply.body} />
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-4 px-4 py-2 bg-[var(--surface)] border-t border-[var(--border)]">
            <VoteWidget
              upvotes={reply.upvotes}
              viewerVote={reply.viewerVote}
              disabled={votingDisabled}
              orientation="horizontal"
              onVote={(value) => onVote(reply.id, value)}
            />
            {isQAndA && canMarkAnswer && !reply.isAnswer && !nested && (
              <button
                type="button"
                onClick={() => onMarkAnswer(reply.id)}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--accent)] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
                Mark as answer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Nested replies (1 level) */}
      {reply.children.length > 0 && (
        <div className="mt-4 space-y-4">
          {reply.children.map((child) => (
            <ReplyCard
              key={child.id}
              reply={child}
              owner={owner}
              name={name}
              nested
              canMarkAnswer={false}
              isQAndA={isQAndA}
              votingDisabled={votingDisabled}
              onVote={onVote}
              onMarkAnswer={onMarkAnswer}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Data fetching ──────────────────────────────────────────────────────────────

async function fetchDiscussionDetail(
  owner: string,
  name: string,
  number: string,
): Promise<DiscussionDetail> {
  const res = await api.get<DiscussionDetailApiResponse>(
    `/api/v1/repositories/${owner}/${name}/discussions/${number}`,
  )
  return res.data.data.discussion
}

function findAcceptedAnswer(
  discussion: DiscussionDetail,
): DiscussionReply | null {
  if (!discussion.acceptedAnswerId) return null
  return (
    discussion.replies.find((r) => r.id === discussion.acceptedAnswerId) ?? null
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function DiscussionDetailPage() {
  const params = useParams<{ owner: string; name: string; number: string }>()
  const queryClient = useQueryClient()
  const { user, isAuthenticated } = useAuthStore()
  const { owner, name, number } = params

  const [commentBody, setCommentBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const discussionQuery = useQuery({
    queryKey: ['discussion', owner, name, number],
    queryFn: () => fetchDiscussionDetail(owner, name, number),
  })

  const discussion = discussionQuery.data

  const isAdmin =
    isAuthenticated && user != null && user.username === owner
  const isAuthor =
    isAuthenticated && user != null && user.username === discussion?.author.login
  const canMarkAnswer = isAdmin || isAuthor
  const isQAndA = discussion?.category === 'q-and-a'

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['discussion', owner, name, number] })
  }, [queryClient, owner, name, number])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const voteDiscussionMutation = useMutation({
    mutationFn: (value: VoteValue) =>
      api.post(
        `/api/v1/repositories/${owner}/${name}/discussions/${number}/vote`,
        { value },
      ),
    onSuccess: invalidate,
  })

  const voteReplyMutation = useMutation({
    mutationFn: ({ replyId, value }: { replyId: string; value: VoteValue }) =>
      api.post(
        `/api/v1/repositories/${owner}/${name}/discussions/${number}/replies/${replyId}/vote`,
        { value },
      ),
    onSuccess: invalidate,
  })

  const markAnswerMutation = useMutation({
    mutationFn: (replyId: string) =>
      api.post(
        `/api/v1/repositories/${owner}/${name}/discussions/${number}/replies/${replyId}/accept`,
      ),
    onSuccess: invalidate,
  })

  const addReplyMutation = useMutation({
    mutationFn: (body: string) =>
      api.post(
        `/api/v1/repositories/${owner}/${name}/discussions/${number}/replies`,
        { body },
      ),
    onSuccess: () => {
      invalidate()
      setCommentBody('')
    },
  })

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) =>
      api.patch(`/api/v1/repositories/${owner}/${name}/discussions/${number}`, {
        locked,
      }),
    onSuccess: invalidate,
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleVoteDiscussion = useCallback(
    (value: VoteValue) => {
      voteDiscussionMutation.mutate(value)
    },
    [voteDiscussionMutation],
  )

  const handleVoteReply = useCallback(
    (replyId: string, value: VoteValue) => {
      voteReplyMutation.mutate({ replyId, value })
    },
    [voteReplyMutation],
  )

  const handleMarkAnswer = useCallback(
    (replyId: string) => {
      markAnswerMutation.mutate(replyId)
    },
    [markAnswerMutation],
  )

  const handleToggleLock = useCallback(() => {
    if (!discussion) return
    lockMutation.mutate(!discussion.locked)
  }, [discussion, lockMutation])

  const handleSubmitReply = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!commentBody.trim()) return
      setSubmitting(true)
      try {
        await addReplyMutation.mutateAsync(commentBody)
      } finally {
        setSubmitting(false)
      }
    },
    [commentBody, addReplyMutation],
  )

  // ── Loading / error states ─────────────────────────────────────────────────

  if (discussionQuery.isLoading) {
    return (
      <div
        style={{ backgroundColor: 'var(--background)', minHeight: '100vh' }}
        className="flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 text-[var(--foreground-secondary)]">
          <svg
            className="animate-spin"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="text-sm">Loading discussion…</span>
        </div>
      </div>
    )
  }

  if (discussionQuery.isError || !discussion) {
    return (
      <div
        style={{ backgroundColor: 'var(--background)', minHeight: '100vh' }}
        className="flex items-center justify-center"
      >
        <div className="text-center space-y-3">
          <p className="text-[var(--error)] font-medium">Discussion not found</p>
          <Link
            href={`/${owner}/${name}/discussions`}
            className="text-sm text-[var(--primary)] hover:underline"
          >
            Back to Discussions
          </Link>
        </div>
      </div>
    )
  }

  const acceptedAnswer = findAcceptedAnswer(discussion)
  const votingDisabled = !isAuthenticated || discussion.locked

  return (
    <div
      style={{
        backgroundColor: 'var(--background)',
        minHeight: '100vh',
        color: 'var(--foreground)',
      }}
      className="px-4 py-8"
    >
      <div className="mx-auto max-w-4xl">
        {/* ── Breadcrumb ── */}
        <nav className="text-sm text-[var(--foreground-secondary)] mb-4">
          <Link href={`/${owner}`} className="hover:text-[var(--primary)] hover:underline">
            {owner}
          </Link>
          {' / '}
          <Link
            href={`/${owner}/${name}`}
            className="hover:text-[var(--primary)] hover:underline"
          >
            {name}
          </Link>
          {' / '}
          <Link
            href={`/${owner}/${name}/discussions`}
            className="hover:text-[var(--primary)] hover:underline"
          >
            Discussions
          </Link>
          {' / '}
          <span className="text-[var(--foreground)]">#{discussion.number}</span>
        </nav>

        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--foreground)] leading-tight">
            {discussion.title}{' '}
            <span className="font-normal text-[var(--foreground-secondary)]">
              #{discussion.number}
            </span>
          </h1>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <StateBadge state={discussion.state} />
            <CategoryBadge slug={discussion.category} label={discussion.categoryLabel} />
            {discussion.locked && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-[var(--warning)]/15 text-[var(--warning)] ring-1 ring-[var(--warning)]/40">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm6.5 2V4a2.5 2.5 0 1 0-5 0v2Z" />
                </svg>
                Locked
              </span>
            )}
            <p className="text-sm text-[var(--foreground-secondary)]">
              <Link
                href={`/${discussion.author.login}`}
                className="font-medium text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
              >
                {discussion.author.login}
              </Link>
              {' started this discussion '}
              <time title={formatDate(discussion.createdAt)}>
                {timeAgo(discussion.createdAt)}
              </time>
            </p>

            {/* Admin lock / unlock */}
            {isAdmin && (
              <button
                type="button"
                onClick={handleToggleLock}
                disabled={lockMutation.isPending}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-50 transition-colors"
              >
                {discussion.locked
                  ? lockMutation.isPending
                    ? 'Unlocking…'
                    : 'Unlock discussion'
                  : lockMutation.isPending
                    ? 'Locking…'
                    : 'Lock discussion'}
              </button>
            )}
          </div>
        </div>

        {/* ── Opening post ── */}
        <div className="flex gap-4 items-start mb-8">
          {/* Vote widget */}
          <div className="flex-shrink-0 pt-1">
            <VoteWidget
              upvotes={discussion.upvotes}
              viewerVote={discussion.viewerVote}
              disabled={votingDisabled}
              orientation="vertical"
              onVote={handleVoteDiscussion}
            />
          </div>

          <div className="flex gap-3 flex-1 min-w-0">
            <Link href={`/${discussion.author.login}`} className="flex-shrink-0">
              <UserAvatar
                login={discussion.author.login}
                avatarUrl={discussion.author.avatarUrl}
                size={36}
              />
            </Link>

            <div className="flex-1 min-w-0 border border-[var(--border)] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] text-sm">
                <Link
                  href={`/${discussion.author.login}`}
                  className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
                >
                  {discussion.author.login}
                </Link>
                <time
                  className="text-[var(--foreground-secondary)]"
                  title={formatDate(discussion.createdAt)}
                >
                  {timeAgo(discussion.createdAt)}
                </time>
              </div>
              <div className="px-4 py-4 bg-[var(--surface)]">
                <MarkdownBody content={discussion.body} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Accepted answer (Q&A) ── */}
        {isQAndA && acceptedAnswer && (
          <div className="mb-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--accent)] mb-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
              </svg>
              Answered by {acceptedAnswer.author.login}
            </h2>
            <ReplyCard
              reply={acceptedAnswer}
              owner={owner}
              name={name}
              canMarkAnswer={false}
              isQAndA={isQAndA}
              votingDisabled={votingDisabled}
              onVote={handleVoteReply}
              onMarkAnswer={handleMarkAnswer}
            />
          </div>
        )}

        {/* ── Reply thread ── */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">
            {discussion.replies.length} repl
            {discussion.replies.length === 1 ? 'y' : 'ies'}
          </h2>

          {discussion.replies.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--foreground-secondary)] border border-dashed border-[var(--border)] rounded-lg">
              No replies yet. Be the first to respond.
            </div>
          ) : (
            <div className="space-y-6">
              {discussion.replies
                .filter((r) => r.id !== discussion.acceptedAnswerId)
                .map((reply) => (
                  <ReplyCard
                    key={reply.id}
                    reply={reply}
                    owner={owner}
                    name={name}
                    canMarkAnswer={canMarkAnswer}
                    isQAndA={isQAndA}
                    votingDisabled={votingDisabled}
                    onVote={handleVoteReply}
                    onMarkAnswer={handleMarkAnswer}
                  />
                ))}
            </div>
          )}
        </div>

        {/* ── Comment input ── */}
        {discussion.locked ? (
          <div className="py-4 px-4 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm text-[var(--foreground-secondary)] text-center flex items-center justify-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm6.5 2V4a2.5 2.5 0 1 0-5 0v2Z" />
            </svg>
            This discussion is locked. New replies are disabled.
          </div>
        ) : isAuthenticated ? (
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <UserAvatar
                login={user?.username ?? ''}
                avatarUrl={user?.avatar ?? null}
                size={36}
              />
            </div>
            <form onSubmit={handleSubmitReply} className="flex-1 min-w-0">
              <div className="border border-[var(--border)] rounded-lg overflow-hidden focus-within:border-[var(--primary)] transition-colors">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Write a reply…"
                  rows={5}
                  className="w-full px-4 py-3 text-sm bg-[var(--surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none resize-y"
                />
                <div className="flex justify-end px-4 py-2 bg-[var(--surface)] border-t border-[var(--border)]">
                  <button
                    type="submit"
                    disabled={submitting || !commentBody.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {submitting ? 'Posting…' : 'Reply'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div className="py-3 px-4 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm text-[var(--foreground-secondary)] text-center">
            <Link href="/login" className="text-[var(--primary)] hover:underline">
              Sign in
            </Link>{' '}
            to join the discussion.
          </div>
        )}
      </div>
    </div>
  )
}
