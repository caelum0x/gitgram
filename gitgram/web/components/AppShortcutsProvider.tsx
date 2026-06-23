'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { CommandPalette } from '@/components/CommandPalette'
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal'

interface CommandPaletteContextValue {
  /** Whether the command palette is currently open. */
  isPaletteOpen: boolean
  /** Whether the keyboard shortcuts modal is currently open. */
  isShortcutsOpen: boolean
  /** Open the command palette. */
  openPalette: () => void
  /** Close the command palette. */
  closePalette: () => void
  /** Toggle the command palette open/closed. */
  togglePalette: () => void
  /** Open the keyboard shortcuts modal. */
  openShortcuts: () => void
  /** Close the keyboard shortcuts modal. */
  closeShortcuts: () => void
  /** Toggle the keyboard shortcuts modal open/closed. */
  toggleShortcuts: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

/**
 * Access the global command palette / shortcuts controls.
 *
 * Lets any client component open the palette programmatically, e.g. from a
 * "Search" button: `const { openPalette } = useCommandPalette()`.
 *
 * Must be used within an `<AppShortcutsProvider>`.
 */
export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext)
  if (context === null) {
    throw new Error('useCommandPalette must be used within an AppShortcutsProvider')
  }
  return context
}

/**
 * Returns true when the keyboard event originated from an editable element,
 * so that single-key shortcuts do not fire while the user is typing.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

interface AppShortcutsProviderProps {
  children: React.ReactNode
}

/**
 * App-shell provider that mounts the command palette and keyboard shortcuts
 * modal once and wires up their global keyboard handling:
 *
 * - `⌘K` / `Ctrl+K` toggles the command palette (works even while typing).
 * - `?` opens the keyboard shortcuts modal (ignored while typing in inputs).
 * - `Escape` closes whichever overlay is open.
 *
 * Both overlays are driven in controlled mode from this single source of truth,
 * and the controls are exposed via `useCommandPalette()` so feature components
 * can open the palette programmatically.
 */
export function AppShortcutsProvider({ children }: AppShortcutsProviderProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)

  const openPalette = useCallback(() => {
    setIsShortcutsOpen(false)
    setIsPaletteOpen(true)
  }, [])
  const closePalette = useCallback(() => setIsPaletteOpen(false), [])
  const togglePalette = useCallback(() => {
    setIsShortcutsOpen(false)
    setIsPaletteOpen((prev) => !prev)
  }, [])

  const openShortcuts = useCallback(() => {
    setIsPaletteOpen(false)
    setIsShortcutsOpen(true)
  }, [])
  const closeShortcuts = useCallback(() => setIsShortcutsOpen(false), [])
  const toggleShortcuts = useCallback(() => {
    setIsPaletteOpen(false)
    setIsShortcutsOpen((prev) => !prev)
  }, [])

  // Single global keydown listener owns all shortcut entry points.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // ⌘K / Ctrl+K — toggle palette. Allowed even inside inputs so users can
      // summon it from a focused search box.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        togglePalette()
        return
      }

      // No bare-key shortcuts while typing.
      if (isTypingTarget(event.target)) return

      // "?" — open keyboard shortcuts. Requires Shift on most layouts; ignore
      // when other modifiers are held to avoid clobbering browser shortcuts.
      if (
        event.key === '?' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        toggleShortcuts()
        return
      }

      // Escape closes whichever overlay is currently open.
      if (event.key === 'Escape') {
        if (isPaletteOpen) {
          event.preventDefault()
          setIsPaletteOpen(false)
        } else if (isShortcutsOpen) {
          event.preventDefault()
          setIsShortcutsOpen(false)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePalette, toggleShortcuts, isPaletteOpen, isShortcutsOpen])

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      isPaletteOpen,
      isShortcutsOpen,
      openPalette,
      closePalette,
      togglePalette,
      openShortcuts,
      closeShortcuts,
      toggleShortcuts,
    }),
    [
      isPaletteOpen,
      isShortcutsOpen,
      openPalette,
      closePalette,
      togglePalette,
      openShortcuts,
      closeShortcuts,
      toggleShortcuts,
    ],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette isOpen={isPaletteOpen} onClose={closePalette} />
      <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={closeShortcuts} />
    </CommandPaletteContext.Provider>
  )
}

export default AppShortcutsProvider
