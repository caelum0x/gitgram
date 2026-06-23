/**
 * AITimeMachine Timeline View Component
 * Enhanced with search, diff preview, and better UX
 */
import { useState, useCallback, useMemo } from "react"
import { History, RotateCcw, GitCompare, ChevronRight, Clock, FileText, Search, X, Plus, Minus, Edit, MessageSquare, PlusCircle, MoreVertical, Copy, Eye, User, LogIn, Cloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { vscode } from "@/utils/vscode"

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

interface TimelineViewProps {
  checkpoints: Checkpoint[]
  currentCheckpoint?: string
  authStatus?: AuthStatus
  onRefresh?: () => void
  onCreateCheckpoint?: () => void
}

export const TimelineView = ({ checkpoints, currentCheckpoint, authStatus, onRefresh, onCreateCheckpoint }: TimelineViewProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showChanges, setShowChanges] = useState<string | null>(null)

  const filteredCheckpoints = useMemo(() => {
    if (!searchQuery.trim()) return checkpoints
    const q = searchQuery.toLowerCase()
    return checkpoints.filter(cp => 
      cp.description.toLowerCase().includes(q) || 
      cp.id.toLowerCase().includes(q)
    )
  }, [checkpoints, searchQuery])

  const handleRestore = useCallback((checkpoint: Checkpoint) => {
    vscode.postMessage({ type: "aitmRestore", checkpointId: checkpoint.id })
  }, [])

  const handleDiff = useCallback((checkpoint: Checkpoint, compareWith?: string) => {
    vscode.postMessage({ type: "aitmDiff", fromId: checkpoint.id, toId: compareWith || "current" })
  }, [])

  const handleConversation = useCallback((checkpoint: Checkpoint) => {
    vscode.postMessage({ type: "conversation", id: checkpoint.id })
  }, [])

  const handleCreate = useCallback(() => {
    if (onCreateCheckpoint) {
      onCreateCheckpoint()
    } else {
      vscode.postMessage({ type: "createCheckpoint" })
    }
  }, [onCreateCheckpoint])

  const handlePreview = useCallback((checkpoint: Checkpoint) => {
    vscode.postMessage({ type: "preview", id: checkpoint.id })
  }, [])

  const handleCopyId = useCallback((checkpoint: Checkpoint) => {
    navigator.clipboard.writeText(checkpoint.id)
  }, [])

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (checkpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <History className="w-12 h-12 text-[var(--vscode-descriptionForeground)] mb-4" />
        <h3 className="text-lg font-medium mb-2">No Checkpoints Yet</h3>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          Checkpoints are created automatically when AI makes changes
        </p>
        <div className="flex gap-2">
          <Button variant="default" onClick={handleCreate}>
            <PlusCircle className="w-4 h-4 mr-2" />New Checkpoint
          </Button>
          <Button variant="secondary" onClick={onRefresh}>
            <RotateCcw className="w-4 h-4 mr-2" />Refresh
          </Button>
        </div>
      </div>
    )
  }

  const handleUndo = useCallback(() => {
    if (checkpoints.length >= 2) {
      vscode.postMessage({ type: "undo" })
    }
  }, [checkpoints])

  const handleLogin = useCallback(() => {
    vscode.postMessage({ type: "login" })
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">🕐 AI Time Machine</span>
          <div className="flex gap-1">
            {authStatus?.authenticated ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-green-400">
                    <User className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{authStatus.user?.email || 'Authenticated'}</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleLogin} className="h-7 text-xs text-yellow-400">
                    <LogIn className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Login for cloud sync</TooltipContent>
              </Tooltip>
            )}
            {authStatus?.cloudSync && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-green-400"><Cloud className="w-3 h-3" /></span>
                </TooltipTrigger>
                <TooltipContent>Cloud sync enabled</TooltipContent>
              </Tooltip>
            )}
            {checkpoints.length >= 2 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleUndo} className="h-7 text-xs">
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo to previous checkpoint</TooltipContent>
              </Tooltip>
            )}
            <Button variant="ghost" size="sm" onClick={handleCreate} className="h-7 text-xs">
              <PlusCircle className="w-3 h-3 mr-1" />New
            </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-[var(--vscode-panel-border)]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <input
            type="text"
            placeholder="Search checkpoints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
          <span>{filteredCheckpoints.length} checkpoint{filteredCheckpoints.length !== 1 ? 's' : ''}</span>
          <button onClick={onRefresh} className="hover:text-[var(--vscode-foreground)]">
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {filteredCheckpoints.map((checkpoint, index) => {
          const isSelected = selectedId === checkpoint.id
          const isExpanded = expandedId === checkpoint.id
          const isCurrent = currentCheckpoint === checkpoint.id
          const prevCheckpoint = filteredCheckpoints[index + 1]
          const isShowingChanges = showChanges === checkpoint.id
          const status = checkpoint.metadata?.status

          return (
            <div key={checkpoint.id} className={cn("border-b border-[var(--vscode-panel-border)] transition-colors", isSelected && "bg-[var(--vscode-list-activeSelectionBackground)]")}>
              {/* Main row */}
              <div
                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)]"
                onClick={() => {
                  setSelectedId(isSelected ? null : checkpoint.id)
                  setExpandedId(isExpanded ? null : checkpoint.id)
                }}
              >
                <div className="relative flex-shrink-0">
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full border-2",
                    status === 'before' ? "bg-blue-500 border-blue-500" :
                    status === 'after' ? "bg-green-500 border-green-500" :
                    status === 'failed' ? "bg-red-500 border-red-500" :
                    isCurrent ? "bg-[var(--vscode-gitDecoration-addedResourceForeground)] border-[var(--vscode-gitDecoration-addedResourceForeground)]" :
                    "bg-transparent border-[var(--vscode-descriptionForeground)]"
                  )} />
                  {index < filteredCheckpoints.length - 1 && (
                    <div className="absolute top-3 left-1/2 w-px h-6 -translate-x-1/2 bg-[var(--vscode-panel-border)]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate">{checkpoint.description}</span>
                    {status === 'before' && <Badge variant="info">before</Badge>}
                    {status === 'after' && <Badge variant="success">after</Badge>}
                    {status === 'failed' && <Badge variant="error">failed</Badge>}
                    {isCurrent && <Badge>NOW</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                    <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatTimeAgo(checkpoint.timestamp)}</span>
                    <span className="flex items-center gap-0.5"><FileText className="w-3 h-3" />{checkpoint.files}</span>
                    {checkpoint.changes && (
                      <span className="flex items-center gap-1">
                        {checkpoint.changes.added.length > 0 && <span className="text-[var(--vscode-gitDecoration-addedResourceForeground)]">+{checkpoint.changes.added.length}</span>}
                        {checkpoint.changes.modified.length > 0 && <span className="text-[var(--vscode-gitDecoration-modifiedResourceForeground)]">~{checkpoint.changes.modified.length}</span>}
                        {checkpoint.changes.deleted.length > 0 && <span className="text-[var(--vscode-gitDecoration-deletedResourceForeground)]">-{checkpoint.changes.deleted.length}</span>}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className={cn("w-4 h-4 flex-shrink-0 transition-transform text-[var(--vscode-descriptionForeground)]", isExpanded && "rotate-90")} />
              </div>

              {/* Expanded actions */}
              {isExpanded && (
                <div className="px-2 pb-2 pl-6 space-y-2">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleRestore(checkpoint) }}>
                          <RotateCcw className="w-3 h-3 mr-1" />Restore
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restore files to this checkpoint</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleDiff(checkpoint) }}>
                          <GitCompare className="w-3 h-3 mr-1" />Diff
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Compare with current state</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleConversation(checkpoint) }}>
                          <MessageSquare className="w-3 h-3 mr-1" />Chat
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View conversation at this point</TooltipContent>
                    </Tooltip>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePreview(checkpoint)}>
                          <Eye className="w-3 h-3 mr-2" />Preview restore
                        </DropdownMenuItem>
                        {prevCheckpoint && (
                          <DropdownMenuItem onClick={() => handleDiff(checkpoint, prevCheckpoint.id)}>
                            <GitCompare className="w-3 h-3 mr-2" />Diff vs previous
                          </DropdownMenuItem>
                        )}
                        {checkpoint.changes && (
                          <DropdownMenuItem onClick={() => setShowChanges(isShowingChanges ? null : checkpoint.id)}>
                            <FileText className="w-3 h-3 mr-2" />{isShowingChanges ? "Hide files" : "Show files"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleCopyId(checkpoint)}>
                          <Copy className="w-3 h-3 mr-2" />Copy ID
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Changes preview */}
                  {isShowingChanges && checkpoint.changes && (
                    <div className="text-[11px] bg-[var(--vscode-editor-background)] rounded p-2 max-h-40 overflow-y-auto space-y-0.5">
                      {checkpoint.changes.added.slice(0, 8).map(f => (
                        <div 
                          key={f} 
                          className="flex items-center gap-1 text-[var(--vscode-gitDecoration-addedResourceForeground)] hover:bg-[var(--vscode-list-hoverBackground)] px-1 rounded cursor-pointer"
                          onClick={() => vscode.postMessage({ type: 'fileDiff', checkpointId: checkpoint.id, filePath: f })}
                        >
                          <Plus className="w-3 h-3 flex-shrink-0" /><span className="truncate">{f}</span>
                        </div>
                      ))}
                      {checkpoint.changes.modified.slice(0, 8).map(f => (
                        <div 
                          key={f} 
                          className="flex items-center gap-1 text-[var(--vscode-gitDecoration-modifiedResourceForeground)] hover:bg-[var(--vscode-list-hoverBackground)] px-1 rounded cursor-pointer"
                          onClick={() => vscode.postMessage({ type: 'fileDiff', checkpointId: checkpoint.id, filePath: f })}
                        >
                          <Edit className="w-3 h-3 flex-shrink-0" /><span className="truncate">{f}</span>
                        </div>
                      ))}
                      {checkpoint.changes.deleted.slice(0, 8).map(f => (
                        <div key={f} className="flex items-center gap-1 text-[var(--vscode-gitDecoration-deletedResourceForeground)] px-1">
                          <Minus className="w-3 h-3 flex-shrink-0" /><span className="truncate">{f}</span>
                        </div>
                      ))}
                      {(checkpoint.changes.added.length + checkpoint.changes.modified.length + checkpoint.changes.deleted.length) > 24 && (
                        <div className="text-[var(--vscode-descriptionForeground)] px-1">...and more</div>
                      )}
                    </div>
                  )}

                  <div className="text-[10px] text-[var(--vscode-descriptionForeground)] font-mono">{checkpoint.id}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TimelineView
