'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export function Confetti() {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; color: string }>>([])

  useEffect(() => {
    const colors = ['#58a6ff', '#238636', '#d29922', '#da3633']
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)]
    }))
    setParticles(newParticles)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{ y: -20, x: `${particle.x}vw`, opacity: 1, rotate: 0 }}
          animate={{
            y: '100vh',
            rotate: 360,
            opacity: 0
          }}
          transition={{
            duration: 2 + Math.random() * 2,
            ease: 'easeIn'
          }}
          className="absolute w-2 h-2 rounded-full"
          style={{ backgroundColor: particle.color }}
        />
      ))}
    </div>
  )
}
