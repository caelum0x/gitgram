'use client'

import { useRouter } from 'next/navigation'
import {
  buildRepoTextPath,
  buildRepoTextRawPath,
} from '@/utils/repositoryRouting'

interface RepoTextQuickActionsProps {
  owner: string
  name: string
  className?: string
  buttonClassName?: string
  rawButtonClassName?: string
}

export default function RepoTextQuickActions({
  owner,
  name,
  className = '',
  buttonClassName = '',
  rawButtonClassName = '',
}: RepoTextQuickActionsProps) {
  const router = useRouter()

  const baseButtonClassName =
    'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition'

  const handleTextClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    router.push(buildRepoTextPath(owner, name))
  }

  const handleRawClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    window.open(buildRepoTextRawPath(owner, name), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleTextClick}
        className={`${baseButtonClassName} ${buttonClassName}`}
      >
        Text
      </button>
      <button
        type="button"
        onClick={handleRawClick}
        className={`${baseButtonClassName} ${rawButtonClassName || buttonClassName}`}
      >
        Raw
      </button>
    </div>
  )
}
