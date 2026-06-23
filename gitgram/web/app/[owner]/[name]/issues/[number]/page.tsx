'use client'

import { useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ─────────────────────────────────────────────────────────────────────

type IssueState = 'open' | 'closed'

interface IssueLabel {
  id: string
  name: string
  color: string
  description: string | null
}

interface IssueAssignee {
  login: string
  avatarUrl: string | null
}

interface IssueMilestone {
  id: string
  number: number
  title: string
  dueOn: string | null
  state: 'open' | 'closed'
}

interface IssueComment {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  author: {
    login: string
    avatarUrl: string | null
  }
}

interface IssueDetail {
  id: string
  number: number
  title: string
  state: IssueState
  body: string | null
  commentCount: number
  labels: IssueLabel[]
  assignees: IssueAssignee[]
  milestone: IssueMilestone | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  author: {
    login: string
    avatarUrl: string | null
  }
  comments: IssueComment[]
}

interface IssueDetailApiResponse {
  data: {
    issue: IssueDetail
  }
}

interface AvailableLabelsApiResponse {
  data: {
    labels: IssueLabel[]
  }
}

interface AvailableMilestonesApiResponse {
  data: {
    milestones: IssueMilestone[]
  }
}

interface AvailableAssigneesApiResponse {
  data: {
    assignees: IssueAssignee[]
  }
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

function hexToContrastText(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OpenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label="Open issue" role="img">
      <circle cx="8" cy="8" r="6.5" stroke="#3fb950" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="#3fb950" />
    </svg>
  )
}

function ClosedIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-label="Closed issue" role="img">
      <circle cx="8" cy="8" r="6.5" fill="#8b949e" stroke="#8b949e" strokeWidth="1.5" />
      <path
        d="M5 8l2 2 4-4"
        stroke="#0d1117"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface LabelBadgeProps {
  label: IssueLabel
}

function LabelBadge({ label }: LabelBadgeProps) {
  const bg = `#${label.color}`
  const fg = hexToContrastText(label.color)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: bg, color: fg }}
      title={label.description ?? label.name}
    >
      {label.name}
    </span>
  )
}

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

interface MarkdownBodyProps {
  content: string
}

function MarkdownBody({ content }: MarkdownBodyProps) {
  // Simple markdown rendering: paragraphs, code blocks, bold, italic
  // In a production app you would use remark/rehype or react-markdown
  const lines = content.split('\n')
  const rendered: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLang = ''
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
        codeLang = ''
      } else {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
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

interface CommentCardProps {
  comment: IssueComment
  currentUserLogin: string | null
  onEdit: (commentId: string, newBody: string) => Promise<void>
}

function CommentCard({ comment, currentUserLogin, onEdit }: CommentCardProps) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)
  const isAuthor = currentUserLogin === comment.author.login

  const handleSave = useCallback(async () => {
    if (!editBody.trim()) return
    setSaving(true)
    try {
      await onEdit(comment.id, editBody)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [comment.id, editBody, onEdit])

  return (
    <div className="flex gap-3">
      <Link href={`/${comment.author.login}`} className="flex-shrink-0">
        <UserAvatar login={comment.author.login} avatarUrl={comment.author.avatarUrl} size={36} />
      </Link>

      <div className="flex-1 min-w-0 border border-[var(--border)] rounded-lg overflow-hidden">
        {/* Comment header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)]">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/${comment.author.login}`}
              className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
            >
              {comment.author.login}
            </Link>
            <span className="text-[var(--foreground-secondary)]">commented</span>
            <time
              className="text-[var(--foreground-secondary)]"
              title={formatDate(comment.createdAt)}
            >
              {timeAgo(comment.createdAt)}
            </time>
            {comment.updatedAt !== comment.createdAt && (
              <span className="text-[var(--foreground-secondary)] text-xs">(edited)</span>
            )}
          </div>

          {isAuthor && !editing && (
            <button
              type="button"
              onClick={() => {
                setEditBody(comment.body)
                setEditing(true)
              }}
              className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
              title="Edit comment"
            >
              Edit
            </button>
          )}
        </div>

        {/* Comment body */}
        <div className="px-4 py-3 bg-[var(--surface)]">
          {editing ? (
            <div className="space-y-3">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] resize-y transition-colors"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !editBody.trim()}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <MarkdownBody content={comment.body} />
          )}
        </div>
      </div>
    </div>
  )
}

interface SidebarSectionProps {
  title: string
  children: React.ReactNode
}

function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="border-b border-[var(--border)] pb-4 mb-4 last:border-b-0 last:mb-0 last:pb-0">
      <h3 className="text-xs font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}

// ─── Data fetching ──────────────────────────────────────────────────────────────

async function fetchIssueDetail(
  owner: string,
  name: string,
  number: string,
): Promise<IssueDetail> {
  const res = await api.get<IssueDetailApiResponse>(
    `/api/v1/repositories/${owner}/${name}/issues/${number}`,
  )
  return res.data.data.issue
}

async function fetchAvailableLabels(owner: string, name: string): Promise<IssueLabel[]> {
  const res = await api.get<AvailableLabelsApiResponse>(
    `/api/v1/repositories/${owner}/${name}/labels`,
  )
  return res.data.data.labels
}

async function fetchAvailableMilestones(owner: string, name: string): Promise<IssueMilestone[]> {
  const res = await api.get<AvailableMilestonesApiResponse>(
    `/api/v1/repositories/${owner}/${name}/milestones`,
  )
  return res.data.data.milestones
}

async function fetchAvailableAssignees(owner: string, name: string): Promise<IssueAssignee[]> {
  const res = await api.get<AvailableAssigneesApiResponse>(
    `/api/v1/repositories/${owner}/${name}/collaborators`,
  )
  return res.data.data.assignees
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function IssueDetailPage() {
  const params = useParams<{ owner: string; name: string; number: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, isAuthenticated } = useAuthStore()
  const { owner, name, number } = params

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const issueQuery = useQuery({
    queryKey: ['issue', owner, name, number],
    queryFn: () => fetchIssueDetail(owner, name, number),
  })

  const labelsQuery = useQuery({
    queryKey: ['labels', owner, name],
    queryFn: () => fetchAvailableLabels(owner, name),
  })

  const milestonesQuery = useQuery({
    queryKey: ['milestones', owner, name],
    queryFn: () => fetchAvailableMilestones(owner, name),
  })

  const assigneesQuery = useQuery({
    queryKey: ['assignees', owner, name],
    queryFn: () => fetchAvailableAssignees(owner, name),
  })

  const issue = issueQuery.data

  const isOwnerOrAuthor =
    isAuthenticated &&
    user != null &&
    (user.username === owner || user.username === issue?.author.login)

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateTitleMutation = useMutation({
    mutationFn: (newTitle: string) =>
      api.patch(`/api/v1/repositories/${owner}/${name}/issues/${number}`, {
        title: newTitle,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', owner, name, number] })
      setIsEditingTitle(false)
    },
  })

  const toggleStateMutation = useMutation({
    mutationFn: (newState: IssueState) =>
      api.patch(`/api/v1/repositories/${owner}/${name}/issues/${number}`, {
        state: newState,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', owner, name, number] })
    },
  })

  const addCommentMutation = useMutation({
    mutationFn: (body: string) =>
      api.post(`/api/v1/repositories/${owner}/${name}/issues/${number}/comments`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', owner, name, number] })
      setCommentBody('')
    },
  })

  const updateLabelsMutation = useMutation({
    mutationFn: (labelIds: string[]) =>
      api.put(`/api/v1/repositories/${owner}/${name}/issues/${number}/labels`, {
        labelIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', owner, name, number] })
    },
  })

  const updateAssigneesMutation = useMutation({
    mutationFn: (logins: string[]) =>
      api.put(`/api/v1/repositories/${owner}/${name}/issues/${number}/assignees`, {
        assignees: logins,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', owner, name, number] })
    },
  })

  const updateMilestoneMutation = useMutation({
    mutationFn: (milestoneId: string | null) =>
      api.patch(`/api/v1/repositories/${owner}/${name}/issues/${number}`, {
        milestoneId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', owner, name, number] })
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTitleSave = useCallback(() => {
    if (titleInput.trim()) {
      updateTitleMutation.mutate(titleInput.trim())
    }
  }, [titleInput, updateTitleMutation])

  const handleToggleState = useCallback(() => {
    if (!issue) return
    toggleStateMutation.mutate(issue.state === 'open' ? 'closed' : 'open')
  }, [issue, toggleStateMutation])

  const handleSubmitComment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!commentBody.trim()) return
      setSubmittingComment(true)
      try {
        await addCommentMutation.mutateAsync(commentBody)
      } finally {
        setSubmittingComment(false)
      }
    },
    [commentBody, addCommentMutation],
  )

  const handleEditComment = useCallback(
    async (commentId: string, newBody: string) => {
      await api.patch(
        `/api/v1/repositories/${owner}/${name}/issues/${number}/comments/${commentId}`,
        { body: newBody },
      )
      queryClient.invalidateQueries({ queryKey: ['issue', owner, name, number] })
    },
    [owner, name, number, queryClient],
  )

  const handleLabelToggle = useCallback(
    (labelId: string) => {
      if (!issue) return
      const current = issue.labels.map((l) => l.id)
      const next = current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId]
      updateLabelsMutation.mutate(next)
    },
    [issue, updateLabelsMutation],
  )

  const handleAssigneeToggle = useCallback(
    (login: string) => {
      if (!issue) return
      const current = issue.assignees.map((a) => a.login)
      const next = current.includes(login)
        ? current.filter((l) => l !== login)
        : [...current, login]
      updateAssigneesMutation.mutate(next)
    },
    [issue, updateAssigneesMutation],
  )

  const handleMilestoneChange = useCallback(
    (milestoneId: string | null) => {
      updateMilestoneMutation.mutate(milestoneId)
    },
    [updateMilestoneMutation],
  )

  // ── Loading / error states ─────────────────────────────────────────────────

  if (issueQuery.isLoading) {
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
          <span className="text-sm">Loading issue…</span>
        </div>
      </div>
    )
  }

  if (issueQuery.isError || !issue) {
    return (
      <div
        style={{ backgroundColor: 'var(--background)', minHeight: '100vh' }}
        className="flex items-center justify-center"
      >
        <div className="text-center space-y-3">
          <p className="text-[var(--error)] font-medium">Issue not found</p>
          <Link
            href={`/${owner}/${name}/issues`}
            className="text-sm text-[var(--primary)] hover:underline"
          >
            Back to Issues
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ backgroundColor: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)' }}
      className="px-4 py-8"
    >
      <div className="mx-auto max-w-5xl">

        {/* ── Breadcrumb ── */}
        <nav className="text-sm text-[var(--foreground-secondary)] mb-4">
          <Link href={`/${owner}`} className="hover:text-[var(--primary)] hover:underline">
            {owner}
          </Link>
          {' / '}
          <Link href={`/${owner}/${name}`} className="hover:text-[var(--primary)] hover:underline">
            {name}
          </Link>
          {' / '}
          <Link href={`/${owner}/${name}/issues`} className="hover:text-[var(--primary)] hover:underline">
            Issues
          </Link>
          {' / '}
          <span className="text-[var(--foreground)]">#{issue.number}</span>
        </nav>

        {/* ── Issue title ── */}
        <div className="mb-4">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave()
                  if (e.key === 'Escape') setIsEditingTitle(false)
                }}
                className="flex-1 px-3 py-1.5 text-xl font-bold bg-[var(--background)] border border-[var(--primary)] rounded-md text-[var(--foreground)] focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handleTitleSave}
                disabled={updateTitleMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingTitle(false)}
                className="px-3 py-1.5 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-3 group">
              <h1 className="text-2xl font-bold text-[var(--foreground)] leading-tight flex-1">
                {issue.title}{' '}
                <span className="font-normal text-[var(--foreground-secondary)]">
                  #{issue.number}
                </span>
              </h1>
              {isOwnerOrAuthor && (
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(issue.title)
                    setIsEditingTitle(true)
                  }}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1 px-2.5 py-1 text-xs border border-[var(--border)] rounded-md text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-all"
                >
                  Edit
                </button>
              )}
            </div>
          )}

          {/* State badge + meta */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                issue.state === 'open'
                  ? 'bg-green-950 text-green-400 ring-1 ring-green-700'
                  : 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] ring-1 ring-[var(--border)]'
              }`}
            >
              {issue.state === 'open' ? <OpenIcon size={14} /> : <ClosedIcon size={14} />}
              {issue.state === 'open' ? 'Open' : 'Closed'}
            </span>

            <p className="text-sm text-[var(--foreground-secondary)]">
              <Link
                href={`/${issue.author.login}`}
                className="font-medium text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
              >
                {issue.author.login}
              </Link>
              {' opened this issue '}
              <time title={formatDate(issue.createdAt)}>{timeAgo(issue.createdAt)}</time>
              {' · '}
              {issue.commentCount} comment{issue.commentCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* ── Main column ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Issue body */}
            <div className="flex gap-3">
              <Link href={`/${issue.author.login}`} className="flex-shrink-0">
                <UserAvatar
                  login={issue.author.login}
                  avatarUrl={issue.author.avatarUrl}
                  size={36}
                />
              </Link>

              <div className="flex-1 min-w-0 border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)]">
                  <div className="flex items-center gap-2 text-sm">
                    <Link
                      href={`/${issue.author.login}`}
                      className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
                    >
                      {issue.author.login}
                    </Link>
                    <span className="text-[var(--foreground-secondary)]">opened this issue</span>
                    <time
                      className="text-[var(--foreground-secondary)]"
                      title={formatDate(issue.createdAt)}
                    >
                      {timeAgo(issue.createdAt)}
                    </time>
                  </div>
                  <div className="flex gap-2">
                    {issue.labels.map((label) => (
                      <LabelBadge key={label.id} label={label} />
                    ))}
                  </div>
                </div>

                <div className="px-4 py-4 bg-[var(--surface)]">
                  {issue.body ? (
                    <MarkdownBody content={issue.body} />
                  ) : (
                    <p className="text-sm italic text-[var(--foreground-secondary)]">
                      No description provided.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Comment thread */}
            {issue.comments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                currentUserLogin={user?.username ?? null}
                onEdit={handleEditComment}
              />
            ))}

            {/* State toggle event marker */}
            {issue.closedAt && (
              <div className="flex items-center gap-2 py-2 ml-12 text-sm text-[var(--foreground-secondary)]">
                <ClosedIcon size={14} />
                <span>
                  Issue closed{' '}
                  <time title={formatDate(issue.closedAt)}>{timeAgo(issue.closedAt)}</time>
                </span>
              </div>
            )}

            {/* Close / reopen button */}
            {isOwnerOrAuthor && (
              <div className="flex items-center gap-3 ml-12 py-2">
                <button
                  type="button"
                  onClick={handleToggleState}
                  disabled={toggleStateMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border transition-colors disabled:opacity-50 ${
                    issue.state === 'open'
                      ? 'border-[var(--error)] text-[var(--error)] hover:bg-red-950'
                      : 'border-[var(--accent)] text-[var(--accent)] hover:bg-green-950'
                  }`}
                >
                  {issue.state === 'open' ? (
                    <>
                      <ClosedIcon size={14} />
                      {toggleStateMutation.isPending ? 'Closing…' : 'Close issue'}
                    </>
                  ) : (
                    <>
                      <OpenIcon size={14} />
                      {toggleStateMutation.isPending ? 'Reopening…' : 'Reopen issue'}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Add comment form */}
            {isAuthenticated ? (
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <UserAvatar
                    login={user?.username ?? ''}
                    avatarUrl={user?.avatar ?? null}
                    size={36}
                  />
                </div>
                <form onSubmit={handleSubmitComment} className="flex-1 min-w-0">
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden focus-within:border-[var(--primary)] transition-colors">
                    <textarea
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Leave a comment…"
                      rows={5}
                      className="w-full px-4 py-3 text-sm bg-[var(--surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none resize-y"
                    />
                    <div className="flex justify-end px-4 py-2 bg-[var(--surface)] border-t border-[var(--border)]">
                      <button
                        type="submit"
                        disabled={submittingComment || !commentBody.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
                      >
                        {submittingComment ? 'Posting…' : 'Comment'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <div className="ml-12 py-3 px-4 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm text-[var(--foreground-secondary)] text-center">
                <Link href="/login" className="text-[var(--primary)] hover:underline">
                  Sign in
                </Link>{' '}
                to leave a comment.
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside className="w-64 flex-shrink-0 space-y-0 border border-[var(--border)] rounded-lg bg-[var(--surface)] p-4">
            {/* Labels */}
            <SidebarSection title="Labels">
              {issue.labels.length === 0 ? (
                <p className="text-xs text-[var(--foreground-secondary)]">None yet</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {issue.labels.map((label) => (
                    <LabelBadge key={label.id} label={label} />
                  ))}
                </div>
              )}
              {isOwnerOrAuthor && labelsQuery.data && labelsQuery.data.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-[var(--primary)] cursor-pointer hover:underline">
                    Manage labels
                  </summary>
                  <div className="mt-2 space-y-1">
                    {labelsQuery.data.map((label) => {
                      const active = issue.labels.some((l) => l.id === label.id)
                      return (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => handleLabelToggle(label.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-[var(--surface-secondary)] transition-colors ${
                            active ? 'opacity-100' : 'opacity-60'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: `#${label.color}` }}
                          />
                          <span className="text-[var(--foreground)]">{label.name}</span>
                          {active && (
                            <span className="ml-auto text-[var(--primary)]">&#10003;</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </details>
              )}
            </SidebarSection>

            {/* Assignees */}
            <SidebarSection title="Assignees">
              {issue.assignees.length === 0 ? (
                <p className="text-xs text-[var(--foreground-secondary)]">No one assigned</p>
              ) : (
                <div className="space-y-1.5">
                  {issue.assignees.map((a) => (
                    <div key={a.login} className="flex items-center gap-2">
                      <UserAvatar login={a.login} avatarUrl={a.avatarUrl} size={20} />
                      <Link
                        href={`/${a.login}`}
                        className="text-xs text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
                      >
                        {a.login}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
              {isOwnerOrAuthor && assigneesQuery.data && assigneesQuery.data.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-[var(--primary)] cursor-pointer hover:underline">
                    Manage assignees
                  </summary>
                  <div className="mt-2 space-y-1">
                    {assigneesQuery.data.map((a) => {
                      const active = issue.assignees.some((x) => x.login === a.login)
                      return (
                        <button
                          key={a.login}
                          type="button"
                          onClick={() => handleAssigneeToggle(a.login)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-[var(--surface-secondary)] transition-colors ${
                            active ? 'opacity-100' : 'opacity-60'
                          }`}
                        >
                          <UserAvatar login={a.login} avatarUrl={a.avatarUrl} size={16} />
                          <span className="text-[var(--foreground)]">{a.login}</span>
                          {active && (
                            <span className="ml-auto text-[var(--primary)]">&#10003;</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </details>
              )}
            </SidebarSection>

            {/* Milestone */}
            <SidebarSection title="Milestone">
              {issue.milestone ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="text-[var(--foreground-secondary)]"
                    >
                      <path d="M7.998 0a8 8 0 1 1-.002 16.001A8 8 0 0 1 7.998 0Zm.004 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 4.5a.75.75 0 0 1 .75.75v3.44l1.78 1.78a.75.75 0 0 1-1.06 1.06L7.22 9.28A.75.75 0 0 1 7 8.75v-3.5A.75.75 0 0 1 8 4.5Z" />
                    </svg>
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {issue.milestone.title}
                    </span>
                  </div>
                  {issue.milestone.dueOn && (
                    <p className="text-xs text-[var(--foreground-secondary)]">
                      Due {formatDate(issue.milestone.dueOn)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--foreground-secondary)]">No milestone</p>
              )}

              {isOwnerOrAuthor && milestonesQuery.data && (
                <details className="mt-2">
                  <summary className="text-xs text-[var(--primary)] cursor-pointer hover:underline">
                    Set milestone
                  </summary>
                  <div className="mt-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => handleMilestoneChange(null)}
                      className="w-full text-left px-2 py-1 rounded text-xs text-[var(--foreground-secondary)] hover:bg-[var(--surface-secondary)] transition-colors"
                    >
                      No milestone
                    </button>
                    {milestonesQuery.data.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleMilestoneChange(m.id)}
                        className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs text-left hover:bg-[var(--surface-secondary)] transition-colors ${
                          issue.milestone?.id === m.id
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--foreground)]'
                        }`}
                      >
                        <span>{m.title}</span>
                        {issue.milestone?.id === m.id && (
                          <span className="text-[var(--primary)]">&#10003;</span>
                        )}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </SidebarSection>
          </aside>
        </div>
      </div>
    </div>
  )
}
