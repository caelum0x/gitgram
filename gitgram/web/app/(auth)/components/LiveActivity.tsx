'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

const activities = [
  { user: 'sarah_dev', action: 'starred', project: 'awesome-ui' },
  { user: 'john_code', action: 'forked', project: 'react-tools' },
  { user: 'alex_tech', action: 'deployed', project: 'api-gateway' },
  { user: 'emma_js', action: 'shared', project: 'next-starter' },
  { user: 'mike_py', action: 'commented on', project: 'ml-toolkit' }
]

export function LiveActivity() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % activities.length)
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  const activity = activities[current]

  return (
    <div className="mt-6 p-4 rounded-xl bg-surface/30 border border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
        <span className="text-xs text-foreground-secondary font-medium">Live Activity</span>
      </div>
      
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-xs font-bold text-foreground">
            {activity.user[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">
              <span className="font-semibold">{activity.user}</span>
              {' '}<span className="text-foreground-secondary">{activity.action}</span>
              {' '}<span className="text-primary">{activity.project}</span>
            </p>
            <p className="text-xs text-foreground-secondary">Just now</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
