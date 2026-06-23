/**
 * useAITimeMachine hook
 * Manages AITimeMachine state and communication with extension
 */
import { useState, useCallback, useEffect } from "react"
import { vscode } from "@/utils/vscode"

export interface AITMCheckpoint {
  id: string
  timestamp: number
  description?: string
  fileCount: number
  files?: string[]
  changes?: { added: string[]; modified: string[]; deleted: string[] }
}

interface AITMState {
  checkpoints: AITMCheckpoint[]
  loading: boolean
  error: string | null
}

export function useAITimeMachine() {
  const [state, setState] = useState<AITMState>({
    checkpoints: [],
    loading: false,
    error: null,
  })

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data
      switch (message.type) {
        case "checkpoints":
          setState(s => ({ ...s, checkpoints: message.data || [], loading: false }))
          break
        case "restoreComplete":
          setState(s => ({ ...s, loading: false }))
          break
      }
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const fetchCheckpoints = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    vscode.postMessage({ type: "ready" })
  }, [])

  const restore = useCallback((checkpointId: string) => {
    setState(s => ({ ...s, loading: true }))
    vscode.postMessage({ type: "restore", id: checkpointId })
  }, [])

  const createCheckpoint = useCallback((description?: string) => {
    setState(s => ({ ...s, loading: true }))
    vscode.postMessage({ type: "createCheckpoint", description })
  }, [])

  useEffect(() => {
    fetchCheckpoints()
  }, [fetchCheckpoints])

  return {
    ...state,
    fetchCheckpoints,
    restore,
    createCheckpoint,
  }
}
