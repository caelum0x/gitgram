import * as React from "react"
import { cn } from "@/lib/utils"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "info"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded",
        variant === "default" && "bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]",
        variant === "success" && "bg-green-500/20 text-green-400",
        variant === "warning" && "bg-yellow-500/20 text-yellow-400",
        variant === "error" && "bg-red-500/20 text-red-400",
        variant === "info" && "bg-blue-500/20 text-blue-400",
        className
      )}
      {...props}
    />
  )
}
