'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const RECENT_STORAGE_KEY = 'gitgram:command-palette:recent'
const MAX_RECENT = 6

type CommandCategory = 'Navigation' | 'Actions' | 'Search' | 'Recent'

interface Command {
  id: string
  label: string
  category: CommandCategory
  icon: string
  href?: string
  shortcut?: string[]
  keywords?: string
  onSelect?: () => void
}

interface RecentEntry {
  id: string
  label: string
  href: string
  icon: string
}

interface CommandPaletteProps {
  isOpen?: boolean
  onClose?: () => void
}

const NAVIGATION_COMMANDS: ReadonlyArray<Omit<Command, 'category'>> = [
  { id: 'nav-feed', label: 'Go to Feed', icon: 'home', href: '/feed', shortcut: ['g', 'h'], keywords: 'timeline posts' },
  { id: 'nav-explore', label: 'Go to Explore', icon: 'compass', href: '/explore', shortcut: ['g', 'e'], keywords: 'discover' },
  { id: 'nav-trending', label: 'Go to Trending', icon: 'fire', href: '/trending', shortcut: ['g', 't'], keywords: 'popular hot' },
  { id: 'nav-notifications', label: 'Go to Notifications', icon: 'bell', href: '/notifications', shortcut: ['g', 'n'], keywords: 'alerts activity' },
  { id: 'nav-messages', label: 'Go to Messages', icon: 'chat', href: '/messages', shortcut: ['g', 'm'], keywords: 'dm inbox direct' },
  { id: 'nav-profile', label: 'Go to Profile', icon: 'user', href: '/profile', shortcut: ['g', 'p'], keywords: 'me account' },
  { id: 'nav-settings', label: 'Go to Settings', icon: 'cog', href: '/settings', shortcut: ['g', 's'], keywords: 'preferences config' },
]

const ACTION_COMMANDS: ReadonlyArray<Omit<Command, 'category'>> = [
  { id: 'act-post', label: 'New Post', icon: 'plus', href: '/create?type=post', shortcut: ['n', 'p'], keywords: 'create write compose' },
  { id: 'act-snippet', label: 'New Snippet', icon: 'code', href: '/create?type=snippet', shortcut: ['n', 's'], keywords: 'code gist' },
  { id: 'act-repo', label: 'New Repository', icon: 'repo', href: '/create?type=repo', shortcut: ['n', 'r'], keywords: 'project git' },
  { id: 'act-story', label: 'Create Story', icon: 'camera', href: '/create?type=story', shortcut: ['n', 'c'], keywords: 'reel moment' },
]

function fuzzyScore(query: string, target: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return t.startsWith(q) ? 1000 : 500
  let score = 0
  let ti = 0
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi]
    let found = false
    while (ti < t.length) {
      if (t[ti] === ch) {
        score += 1
        ti += 1
        found = true
        break
      }
      ti += 1
    }
    if (!found) return -1
  }
  return score
}

function readRecent(): RecentEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is RecentEntry =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as RecentEntry).id === 'string' &&
          typeof (item as RecentEntry).href === 'string',
      )
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function writeRecent(entry: RecentEntry): void {
  if (typeof window === 'undefined') return
  try {
    const existing = readRecent().filter((item) => item.id !== entry.id)
    const next = [entry, ...existing].slice(0, MAX_RECENT)
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
    compass: 'M12 21a9 9 0 100-18 9 9 0 000 18zM16 8l-2 6-6 2 2-6 6-2z',
    fire: 'M12 2c1 4 4 5 4 9a4 4 0 11-8 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 0-8z',
    bell: 'M15 17h5l-1.4-1.4A2 2 0 0118 14V11a6 6 0 10-12 0v3a2 2 0 01-.6 1.6L4 17h5m6 0a3 3 0 11-6 0',
    chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1',
    cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1L14.4 3h-4l-.4 2.4a7 7 0 00-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.4h4l.4-2.4a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z',
    plus: 'M12 5v14M5 12h14',
    code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
    repo: 'M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5zM18 17H6',
    camera: 'M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8zM12 16a3 3 0 100-6 3 3 0 000 6z',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
    clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  }
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name] ?? paths.search} />
    </svg>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] uppercase tracking-wide">
      {children}
    </kbd>
  )
}

export function CommandPalette({ isOpen: controlledOpen, onClose }: CommandPaletteProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const close = useCallback(() => {
    if (isControlled) onClose?.()
    else setInternalOpen(false)
  }, [isControlled, onClose])

  // Global Cmd+K / Ctrl+K listener.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (isControlled) {
          if (!controlledOpen) return
        } else {
          setInternalOpen((prev) => !prev)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isControlled, controlledOpen])

  // Reset and focus when opened.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    setRecent(readRecent())
    const id = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(id)
  }, [open])

  const recentCommands: Command[] = useMemo(
    () =>
      recent.map((entry) => ({
        id: `recent-${entry.id}`,
        label: entry.label,
        category: 'Recent' as const,
        icon: entry.icon || 'clock',
        href: entry.href,
      })),
    [recent],
  )

  const allCommands: Command[] = useMemo(() => {
    const nav = NAVIGATION_COMMANDS.map((cmd) => ({ ...cmd, category: 'Navigation' as const }))
    const actions = ACTION_COMMANDS.map((cmd) => ({ ...cmd, category: 'Actions' as const }))
    const searchCmd: Command[] = query.trim()
      ? [
          {
            id: 'search-query',
            label: `Search for "${query.trim()}"`,
            category: 'Search' as const,
            icon: 'search',
            href: `/search?q=${encodeURIComponent(query.trim())}`,
          },
        ]
      : []
    return [...searchCmd, ...nav, ...actions]
  }, [query])

  const filtered: Command[] = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      return [...recentCommands, ...allCommands.filter((c) => c.category !== 'Search')]
    }
    return allCommands
      .map((cmd) => {
        if (cmd.category === 'Search') return { cmd, score: 2000 }
        const haystack = `${cmd.label} ${cmd.keywords ?? ''}`
        return { cmd, score: fuzzyScore(trimmed, haystack) }
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.cmd)
  }, [query, allCommands, recentCommands])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const runCommand = useCallback(
    (command: Command) => {
      if (command.href && !command.id.startsWith('search-') && !command.id.startsWith('recent-')) {
        writeRecent({ id: command.id, label: command.label, href: command.href, icon: command.icon })
      }
      close()
      if (command.onSelect) command.onSelect()
      else if (command.href) router.push(command.href)
    },
    [close, router],
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const selected = filtered[activeIndex]
      if (selected) runCommand(selected)
    }
  }

  // Scroll active item into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  let renderIndex = -1
  const grouped: { category: CommandCategory; items: Command[] }[] = []
  const order: CommandCategory[] = ['Search', 'Recent', 'Navigation', 'Actions']
  for (const category of order) {
    const items = filtered.filter((c) => c.category === category)
    if (items.length > 0) grouped.push({ category, items })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} aria-hidden="true" />

      <div className="relative w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--border)]">
          <span className="text-[var(--foreground-secondary)]">
            <Icon name="search" />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or jump to..."
            className="flex-1 bg-transparent py-3.5 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none"
            aria-label="Command search"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {grouped.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--foreground-secondary)]">
              No commands found for &quot;{query}&quot;
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="mb-1">
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-secondary)]">
                  {group.category}
                </div>
                {group.items.map((command) => {
                  renderIndex += 1
                  const index = renderIndex
                  const isActive = index === activeIndex
                  return (
                    <button
                      key={command.id}
                      data-index={index}
                      type="button"
                      onClick={() => runCommand(command)}
                      onMouseMove={() => setActiveIndex(index)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-[var(--surface-secondary)] text-[var(--foreground)]'
                          : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <span className={isActive ? 'text-[var(--primary)]' : ''}>
                        <Icon name={command.icon} />
                      </span>
                      <span className="flex-1 truncate">{command.label}</span>
                      {command.shortcut && (
                        <span className="flex items-center gap-1">
                          {command.shortcut.map((key, i) => (
                            <Kbd key={`${command.id}-${i}`}>{key}</Kbd>
                          ))}
                        </span>
                      )}
                      {isActive && !command.shortcut && (
                        <span className="text-[10px] text-[var(--foreground-secondary)]">↵</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--border)] text-[11px] text-[var(--foreground-secondary)]">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            to select
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
