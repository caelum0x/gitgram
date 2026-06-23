import React from 'react'

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export const AlertDialog = ({ open, onOpenChange, children }: AlertDialogProps) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-50">{children}</div>
    </div>
  )
}

export const AlertDialogContent = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg p-6 w-[400px] max-w-[90vw]">
    {children}
  </div>
)

export const AlertDialogHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-4">{children}</div>
)

export const AlertDialogTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-lg font-semibold">{children}</h2>
)

export const AlertDialogDescription = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">{children}</p>
)

export const AlertDialogFooter = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end gap-2 mt-4">{children}</div>
)

export const AlertDialogCancel = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className="px-4 py-2 text-sm rounded bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)]"
    {...props}
  >
    {children}
  </button>
)

export const AlertDialogAction = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className="px-4 py-2 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90"
    {...props}
  >
    {children}
  </button>
)
