'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface PasswordStrengthProps {
  password: string
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const getStrength = (pwd: string): { score: number; label: string; color: string } => {
    if (!pwd) return { score: 0, label: '', color: '' }
    
    let score = 0
    if (pwd.length >= 8) score++
    if (pwd.length >= 12) score++
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
    if (/\d/.test(pwd)) score++
    if (/[^a-zA-Z0-9]/.test(pwd)) score++

    if (score <= 2) return { score: 1, label: 'Weak', color: 'bg-error' }
    if (score <= 3) return { score: 2, label: 'Fair', color: 'bg-warning' }
    if (score <= 4) return { score: 3, label: 'Good', color: 'bg-primary' }
    return { score: 4, label: 'Strong', color: 'bg-accent' }
  }

  const strength = getStrength(password)

  if (!password) return null

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((level) => (
          <motion.div
            key={level}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: level <= strength.score ? 1 : 0 }}
            transition={{ duration: 0.3, delay: level * 0.05 }}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              level <= strength.score ? strength.color : 'bg-border'
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs font-medium', strength.color.replace('bg-', 'text-'))}>
        {strength.label}
      </p>
    </div>
  )
}
