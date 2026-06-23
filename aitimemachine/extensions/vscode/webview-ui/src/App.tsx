import { useState, useEffect, useCallback } from 'react'
import { TimelineView } from './components/aitm/TimelineView'
import { RestoreDialog } from './components/aitm/RestoreDialog'
import { TooltipProvider } from './components/ui/tooltip'

// VSCode API
declare const acquireVsCodeApi: () => { postMessage: (msg: any) => void; getState: () => any; setState: (s: any) => void }
export const vscode = acquireVsCodeApi()

interface Checkpoint {
  id: string
  description: string
  timestamp: string
  files: number
  changes?: { added: string[]; modified: string[]; deleted: string[] }
  metadata?: { status?: string; type?: string }
}

interface AuthStatus {
  authenticated: boolean
  user?: { email: string; id: string }
  cloudSync?: boolean
}

function App() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authenticated: false })
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; checkpoint?: Checkpoint }>({ open: false })

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data
      if (msg.type === 'checkpoints') {
        setCheckpoints(msg.data.map((cp: any) => ({
          id: cp.id,
          description: cp.description,
          timestamp: cp.timestamp,
          files: cp.stats?.totalFiles || 0,
          changes: cp.changes,
          metadata: cp.metadata
        })))
      } else if (msg.type === 'authStatus') {
        setAuthStatus(msg.data)
      }
    }
    window.addEventListener('message', handleMessage)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleRefresh = useCallback(() => {
    vscode.postMessage({ type: 'ready' })
  }, [])

  const handleRestore = useCallback((mode: 'files' | 'full') => {
    if (restoreDialog.checkpoint) {
      vscode.postMessage({ type: 'restore', id: restoreDialog.checkpoint.id, mode })
      setRestoreDialog({ open: false })
    }
  }, [restoreDialog.checkpoint])

  return (
    <TooltipProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <TimelineView 
          checkpoints={checkpoints}
          authStatus={authStatus}
          onRefresh={handleRefresh}
        />
        <RestoreDialog
          open={restoreDialog.open}
          onOpenChange={(open) => setRestoreDialog({ ...restoreDialog, open })}
          checkpointId={restoreDialog.checkpoint?.id || ''}
          checkpointDescription={restoreDialog.checkpoint?.description}
          onConfirm={handleRestore}
        />
      </div>
    </TooltipProvider>
  )
}

export default App
