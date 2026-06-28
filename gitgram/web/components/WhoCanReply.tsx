'use client'

import {
  REPLY_PERMISSIONS,
  REPLY_PERMISSION_META,
  type ReplyPermission,
} from '@/services/postService'

interface ReplyPermissionIconProps {
  permission: ReplyPermission
  className?: string
}

function ReplyPermissionIcon({ permission, className }: ReplyPermissionIconProps) {
  const common = {
    className: className ?? 'w-4 h-4',
    fill: 'none' as const,
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    strokeWidth: 2,
  }
  if (permission === 'nobody') {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    )
  }
  if (permission === 'everyone') {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
  // followers / mentioned — a group glyph
  return (
    <svg {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Selector (composer)
// ---------------------------------------------------------------------------

interface WhoCanReplySelectorProps {
  value: ReplyPermission
  onChange: (next: ReplyPermission) => void
}

/**
 * Composer control for choosing who can reply to a post, ported from Bluesky's
 * ThreadgateBtn to the product's stack.
 */
export function WhoCanReplySelector({ value, onChange }: WhoCanReplySelectorProps) {
  return (
    <fieldset className="rounded-xl border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-medium text-foreground">Who can reply</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {REPLY_PERMISSIONS.map((perm) => {
          const selected = value === perm
          return (
            <button
              key={perm}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(perm)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground-secondary hover:bg-surface-secondary'
              }`}
            >
              <ReplyPermissionIcon permission={perm} />
              <span>{REPLY_PERMISSION_META[perm].label}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Read-only notice (post view)
// ---------------------------------------------------------------------------

interface WhoCanReplyNoticeProps {
  permission: ReplyPermission
}

/**
 * Read-only notice rendered on a post that communicates any reply restriction.
 * Renders nothing when anyone can reply (the default), to avoid visual noise.
 */
export function WhoCanReplyNotice({ permission }: WhoCanReplyNoticeProps) {
  if (permission === 'everyone') return null

  const meta = REPLY_PERMISSION_META[permission]
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2 text-xs text-foreground-secondary">
      <ReplyPermissionIcon permission={permission} className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{meta.notice}</span>
    </div>
  )
}
