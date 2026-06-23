'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

const testimonials = [
  {
    text: "Gitgram helped me showcase my projects and connect with amazing developers!",
    author: "Sarah Chen",
    role: "Full Stack Developer",
    avatar: "SC"
  },
  {
    text: "The best platform to discover trending open-source projects. Love it!",
    author: "Alex Kumar",
    role: "Open Source Contributor",
    avatar: "AK"
  },
  {
    text: "Finally, a social network that understands developers. Highly recommended!",
    author: "Emma Rodriguez",
    role: "Software Engineer",
    avatar: "ER"
  }
]

export function Testimonials() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % testimonials.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const testimonial = testimonials[current]

  return (
    <div className="mt-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.4 }}
          className="p-6 rounded-xl bg-surface/30 border border-border/30"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-sm font-bold text-foreground flex-shrink-0">
              {testimonial.avatar}
            </div>
            <div className="flex-1">
              <p className="text-foreground-secondary italic mb-3">"{testimonial.text}"</p>
              <div>
                <p className="text-sm font-semibold text-foreground">{testimonial.author}</p>
                <p className="text-xs text-foreground-secondary">{testimonial.role}</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-1.5 mt-4 justify-center">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === current ? 'w-6 bg-primary' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
