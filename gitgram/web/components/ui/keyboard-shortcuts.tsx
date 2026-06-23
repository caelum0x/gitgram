'use client'

import { useEffect } from 'react'

interface Shortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  action: () => void
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      shortcuts.forEach(({ key, ctrl, shift, action }) => {
        if (!e.key || !key) return
        
        const ctrlMatch = ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey
        const shiftMatch = shift ? e.shiftKey : !e.shiftKey
        
        if (e.key.toLowerCase() === key.toLowerCase() && ctrlMatch && shiftMatch) {
          e.preventDefault()
          action()
        }
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
