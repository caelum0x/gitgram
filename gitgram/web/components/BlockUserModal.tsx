'use client'

import { useState } from 'react'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

interface BlockUserModalProps {
  isOpen: boolean
  onClose: () => void
  username: string
  userId: string
  onBlocked?: () => void
}

export function BlockUserModal({ isOpen, onClose, username, userId, onBlocked }: BlockUserModalProps) {
  const [blocking, setBlocking] = useState(false)
  const { showToast } = useToast()

  const handleClose = () => {
    if (!blocking) onClose()
  }

  const handleBlock = async () => {
    setBlocking(true)
    try {
      await api.post('/v1/privacy/block', { userId })
      showToast(`@${username} has been blocked`, 'success')
      onBlocked?.()
      onClose()
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string; error?: { message?: string } } } }
      const message =
        axiosError.response?.data?.error?.message ||
        axiosError.response?.data?.message ||
        'Failed to block user. Please try again.'
      showToast(message, 'error')
    } finally {
      setBlocking(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <div className="w-12 h-12 rounded-full bg-[var(--error)]/15 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-[var(--error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h2 id="block-modal-title" className="text-base font-semibold text-[var(--foreground)] mb-1">
            Block @{username}?
          </h2>
          <p className="text-sm text-[var(--foreground-secondary)]">
            They won&apos;t be able to see your content, follow you, or send you messages.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={handleClose}
            disabled={blocking}
            className="flex-1 py-2 text-sm border border-[var(--border)] text-[var(--foreground-secondary)] rounded-lg hover:bg-[var(--surface-secondary)] disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleBlock}
            disabled={blocking}
            className="flex-1 py-2 text-sm bg-[var(--error)] text-white rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {blocking ? 'Blocking...' : 'Block'}
          </button>
        </div>
      </div>
    </div>
  )
}
