/**
 * AITimeMachine Restore Dialog Component
 */
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface RestoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  checkpointId: string
  checkpointDescription?: string
  onConfirm: (mode: "files" | "full") => void
}

export const RestoreDialog = ({
  open,
  onOpenChange,
  checkpointId,
  checkpointDescription,
  onConfirm,
}: RestoreDialogProps) => {
  const [mode, setMode] = useState<"files" | "full">("files")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore Checkpoint</AlertDialogTitle>
          <AlertDialogDescription>
            Restore to: {checkpointDescription || checkpointId.slice(0, 12)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                checked={mode === "files"}
                onChange={() => setMode("files")}
                className="w-4 h-4"
              />
              <span>Files only (recommended)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                checked={mode === "full"}
                onChange={() => setMode("full")}
                className="w-4 h-4"
              />
              <span>Full restore (files + context)</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Current state will be backed up before restore.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(mode)}>Restore</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default RestoreDialog
