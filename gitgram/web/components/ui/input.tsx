'use client'

import { forwardRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, type, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false)
    const [hasValue, setHasValue] = useState(false)

    return (
      <div className="relative w-full">
        <div className="relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-secondary">
              {icon}
            </div>
          )}
          
          <input
            type={type}
            className={cn(
              "w-full h-12 px-4 rounded-xl bg-background border border-border text-foreground",
              "placeholder:text-transparent",
              "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
              "transition-all duration-200",
              error && "border-error focus:border-error focus:ring-error/20",
              icon && "pl-11",
              className
            )}
            ref={ref}
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
              setIsFocused(false)
              setHasValue(!!e.target.value)
            }}
            onChange={(e) => setHasValue(!!e.target.value)}
            {...props}
          />
          
          {label && (
            <motion.label
              initial={false}
              animate={{
                top: isFocused || hasValue ? '0.5rem' : '50%',
                fontSize: isFocused || hasValue ? '0.75rem' : '0.875rem',
                translateY: isFocused || hasValue ? '0' : '-50%',
              }}
              transition={{ duration: 0.2 }}
              className={cn(
                "absolute left-4 pointer-events-none",
                "text-foreground-secondary font-medium",
                icon && "left-11"
              )}
            >
              {label}
            </motion.label>
          )}
        </div>
        
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-xs text-error flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </motion.p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
