import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost'
  size?: 'default' | 'sm'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none disabled:opacity-50'
    
    const variants = {
      default: 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90',
      secondary: 'bg-[var(--vscode-input-background)] text-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]',
      ghost: 'hover:bg-[var(--vscode-list-hoverBackground)]'
    }
    
    const sizes = {
      default: 'h-9 px-4 py-2',
      sm: 'h-7 px-3 text-xs'
    }
    
    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className || ''}`}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'
