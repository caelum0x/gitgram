'use client'

import { useEffect, useState } from 'react'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: Shortcut[]
}

interface KeyboardShortcutsModalProps {
  isOpen?: boolean
  onClose?: () => void
}

const SECTIONS: ReadonlyArray<ShortcutSection> = [
  {
    title: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close dialog or menu' },
      { keys: ['/'], description: 'Focus search' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['g', 'h'], description: 'Go to Feed' },
      { keys: ['g', 'e'], description: 'Go to Explore' },
      { keys: ['g', 't'], description: 'Go to Trending' },
      { keys: ['g', 'n'], description: 'Go to Notifications' },
      { keys: ['g', 'm'], description: 'Go to Messages' },
      { keys: ['g', 'p'], description: 'Go to Profile' },
      { keys: ['g', 's'], description: 'Go to Settings' },
    ],
  },
  {
    title: 'Feed',
    shortcuts: [
      { keys: ['j'], description: 'Next post' },
      { keys: ['k'], description: 'Previous post' },
      { keys: ['l'], description: 'Like focused post' },
      { keys: ['c'], description: 'Comment on focused post' },
      { keys: ['s'], description: 'Save / bookmark post' },
      { keys: ['r'], description: 'Refresh feed' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: ['⌘', 'Enter'], description: 'Publish post' },
      { keys: ['⌘', 'B'], description: 'Bold' },
      { keys: ['⌘', 'I'], description: 'Italic' },
      { keys: ['⌘', 'E'], description: 'Inline code' },
      { keys: ['⌘', 'S'], description: 'Save draft' },
    ],
  },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="min-w-[24px] px-1.5 py-1 text-center text-[11px] font-medium rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--foreground)]">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsModal({ isOpen: controlledOpen, onClose }: KeyboardShortcutsModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const close = () => {
    if (isControlled) onClose?.()
    else setInternalOpen(false)
  }

  // Global "?" listener (only when uncontrolled).
  useEffect(() => {
    if (isControlled) return
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (isEditable) return
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        setInternalOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isControlled])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} aria-hidden="true" />

      <div className="relative w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id="shortcuts-modal-title" className="text-base font-semibold text-[var(--foreground)]">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={close}
            className="p-1 rounded text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
            aria-label="Close keyboard shortcuts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="max-h-[70vh] overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-secondary)]">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.shortcuts.map((shortcut) => (
                  <li
                    key={shortcut.description}
                    className="flex items-center justify-between gap-4 py-1.5 text-sm text-[var(--foreground)]"
                  >
                    <span className="text-[var(--foreground-secondary)]">{shortcut.description}</span>
                    <span className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <Kbd key={`${shortcut.description}-${i}`}>{key}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] text-[11px] text-[var(--foreground-secondary)]">
          Press <Kbd>?</Kbd> anytime to toggle this dialog.
        </div>
      </div>
    </div>
  )
}

export default KeyboardShortcutsModal
