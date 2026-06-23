'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface Stat {
  value: number
  label: string
  suffix?: string
}

const stats: Stat[] = [
  { value: 10000, label: 'Developers', suffix: '+' },
  { value: 50000, label: 'Projects', suffix: '+' },
  { value: 1000000, label: 'Stars', suffix: '+' }
]

export function AnimatedStats() {
  return (
    <div className="grid grid-cols-3 gap-6 mt-8">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 + i * 0.1 }}
          className="text-center"
        >
          <Counter target={stat.value} suffix={stat.suffix} />
          <p className="text-xs text-foreground-secondary mt-1">{stat.label}</p>
        </motion.div>
      ))}
    </div>
  )
}

function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const duration = 2000
    const steps = 60
    const increment = target / steps
    let current = 0

    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [target])

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return num.toString()
  }

  return (
    <p className="text-2xl font-bold text-foreground">
      {formatNumber(count)}{suffix}
    </p>
  )
}
