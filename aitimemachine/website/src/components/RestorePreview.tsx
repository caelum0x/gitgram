'use client';

import { useState, useMemo } from 'react';
import {
  File,
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  Edit3,
  Circle,
  Filter,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import DiffViewer from '@/components/DiffViewer';
import type { RestoreFileEntry, RestorePreviewData, FileStatus } from '@/store/restore';

// ============================================
// Tree node for the file hierarchy
// ============================================

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
  file?: RestoreFileEntry;
  // Aggregated status for folders
  statusCounts: Record<FileStatus, number>;
}

function buildFileTree(files: RestoreFileEntry[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: new Map(),
    statusCounts: { added: 0, deleted: 0, modified: 0, unchanged: 0 },
  };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          isDirectory: !isFile,
          children: new Map(),
          file: isFile ? file : undefined,
          statusCounts: { added: 0, deleted: 0, modified: 0, unchanged: 0 },
        });
      }

      const child = current.children.get(part)!;
      if (isFile) {
        child.file = file;
        child.isDirectory = false;
      }

      current = child;
    }

    // Propagate status counts up
    const statusParts = file.path.split('/');
    let propagate = root;
    propagate.statusCounts[file.status]++;
    for (let i = 0; i < statusParts.length - 1; i++) {
      const part = statusParts[i];
      const child = propagate.children.get(part);
      if (child) {
        child.statusCounts[file.status]++;
        propagate = child;
      }
    }
  }

  return root;
}

// ============================================
// Status colors and icons
// ============================================

function getStatusColor(status: FileStatus): string {
  switch (status) {
    case 'added':
      return 'text-green-400';
    case 'deleted':
      return 'text-red-400';
    case 'modified':
      return 'text-yellow-400';
    case 'unchanged':
      return 'text-gray-500';
  }
}

function getStatusBg(status: FileStatus): string {
  switch (status) {
    case 'added':
      return 'bg-green-500/10 border-green-500/20';
    case 'deleted':
      return 'bg-red-500/10 border-red-500/20';
    case 'modified':
      return 'bg-yellow-500/10 border-yellow-500/20';
    case 'unchanged':
      return 'bg-gray-500/5 border-gray-500/10';
  }
}

function getStatusIcon(status: FileStatus) {
  switch (status) {
    case 'added':
      return <Plus className="h-3 w-3 text-green-400" />;
    case 'deleted':
      return <Minus className="h-3 w-3 text-red-400" />;
    case 'modified':
      return <Edit3 className="h-3 w-3 text-yellow-400" />;
    case 'unchanged':
      return <Circle className="h-3 w-3 text-gray-600" />;
  }
}

function getStatusBadgeVariant(status: FileStatus): 'success' | 'destructive' | 'warning' | 'secondary' {
  switch (status) {
    case 'added':
      return 'success';
    case 'deleted':
      return 'destructive';
    case 'modified':
      return 'warning';
    case 'unchanged':
      return 'secondary';
  }
}

// ============================================
// FileTreeItem (recursive)
// ============================================

interface FileTreeItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
  onSelectAllInFolder: (path: string) => void;
  onDeselectAllInFolder: (path: string) => void;
  showOnlyChanged: boolean;
  selectableMode: boolean;
}

function FileTreeItem({
  node,
  depth,
  selectedPath,
  onSelectFile,
  selectedFiles,
  onToggleSelect,
  onSelectAllInFolder,
  onDeselectAllInFolder,
  showOnlyChanged,
  selectableMode,
}: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const sortedChildren = useMemo(() => {
    const dirs: TreeNode[] = [];
    const files: TreeNode[] = [];
    node.children.forEach((child) => {
      if (child.isDirectory) dirs.push(child);
      else files.push(child);
    });
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }, [node]);

  const filteredChildren = useMemo(() => {
    if (!showOnlyChanged) return sortedChildren;
    return sortedChildren.filter((child) => {
      if (child.isDirectory) {
        // Show directory if it contains changed files
        return (
          child.statusCounts.added > 0 ||
          child.statusCounts.deleted > 0 ||
          child.statusCounts.modified > 0
        );
      }
      return child.file?.status !== 'unchanged';
    });
  }, [sortedChildren, showOnlyChanged]);

  if (node.isDirectory) {
    // Count how many files in this folder are selected
    const folderFileCount = node.statusCounts.added + node.statusCounts.deleted + node.statusCounts.modified + node.statusCounts.unchanged;
    const selectedInFolder = filteredChildren.reduce((count, child) => {
      if (!child.isDirectory && selectedFiles.has(child.path)) return count + 1;
      return count;
    }, 0);

    const allSelected = folderFileCount > 0 && selectedInFolder === filteredChildren.filter(c => !c.isDirectory).length;
    const someSelected = selectedInFolder > 0 && !allSelected;

    const handleFolderCheckbox = () => {
      if (allSelected || someSelected) {
        onDeselectAllInFolder(node.path);
      } else {
        onSelectAllInFolder(node.path);
      }
    };

    if (filteredChildren.length === 0 && showOnlyChanged) return null;

    return (
      <div>
        <div
          className="flex items-center gap-1 py-1 px-1 hover:bg-gray-800/50 rounded cursor-pointer group"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          {selectableMode && (
            <button onClick={handleFolderCheckbox} className="mr-1 flex-shrink-0">
              {allSelected ? (
                <CheckSquare className="h-4 w-4 text-blue-400" />
              ) : someSelected ? (
                <MinusSquare className="h-4 w-4 text-blue-400" />
              ) : (
                <Square className="h-4 w-4 text-gray-600" />
              )}
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </button>
          <Folder className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span
            className="text-sm text-gray-300 truncate flex-1"
            onClick={() => setExpanded(!expanded)}
          >
            {node.name}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {node.statusCounts.added > 0 && (
              <span className="text-xs text-green-400">+{node.statusCounts.added}</span>
            )}
            {node.statusCounts.deleted > 0 && (
              <span className="text-xs text-red-400">-{node.statusCounts.deleted}</span>
            )}
            {node.statusCounts.modified > 0 && (
              <span className="text-xs text-yellow-400">~{node.statusCounts.modified}</span>
            )}
          </div>
        </div>
        {expanded && (
          <div>
            {filteredChildren.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                selectedFiles={selectedFiles}
                onToggleSelect={onToggleSelect}
                onSelectAllInFolder={onSelectAllInFolder}
                onDeselectAllInFolder={onDeselectAllInFolder}
                showOnlyChanged={showOnlyChanged}
                selectableMode={selectableMode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  const file = node.file;
  if (!file) return null;
  if (showOnlyChanged && file.status === 'unchanged') return null;

  const isSelected = selectedPath === file.path;
  const isChecked = selectedFiles.has(file.path);

  return (
    <div
      className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer group transition-colors ${
        isSelected ? 'bg-gray-700/50 border border-gray-600' : 'hover:bg-gray-800/50'
      }`}
      style={{ paddingLeft: `${depth * 16 + 4}px` }}
      onClick={() => onSelectFile(file.path)}
    >
      {selectableMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(file.path);
          }}
          className="mr-1 flex-shrink-0"
        >
          {isChecked ? (
            <CheckSquare className="h-4 w-4 text-blue-400" />
          ) : (
            <Square className="h-4 w-4 text-gray-600" />
          )}
        </button>
      )}
      <span className="flex-shrink-0">{getStatusIcon(file.status)}</span>
      <File className={`h-4 w-4 flex-shrink-0 ${getStatusColor(file.status)}`} />
      <span className={`text-sm truncate flex-1 ${getStatusColor(file.status)}`}>
        {node.name}
      </span>
      <span className="text-xs text-gray-600 flex-shrink-0">{formatBytes(file.size)}</span>
    </div>
  );
}

// ============================================
// RestorePreview Component
// ============================================

interface RestorePreviewProps {
  preview: RestorePreviewData;
  selectedFiles: Set<string>;
  onToggleFileSelection: (path: string) => void;
  onSelectAllInFolder: (path: string) => void;
  onDeselectAllInFolder: (path: string) => void;
  onSelectAllChanged: () => void;
  onClearSelection: () => void;
  showOnlyChanged: boolean;
  onSetShowOnlyChanged: (show: boolean) => void;
}

export default function RestorePreview({
  preview,
  selectedFiles,
  onToggleFileSelection,
  onSelectAllInFolder,
  onDeselectAllInFolder,
  onSelectAllChanged,
  onClearSelection,
  showOnlyChanged,
  onSetShowOnlyChanged,
}: RestorePreviewProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectableMode, setSelectableMode] = useState(false);
  const [fileFilter, setFileFilter] = useState('');

  const tree = useMemo(() => buildFileTree(preview.files), [preview.files]);

  const filteredFiles = useMemo(() => {
    if (!fileFilter) return preview.files;
    const q = fileFilter.toLowerCase();
    return preview.files.filter((f) => f.path.toLowerCase().includes(q));
  }, [preview.files, fileFilter]);

  const filteredTree = useMemo(() => {
    if (!fileFilter) return tree;
    return buildFileTree(filteredFiles);
  }, [filteredFiles, fileFilter, tree]);

  const selectedFile = useMemo(
    () => preview.files.find((f) => f.path === selectedFilePath),
    [preview.files, selectedFilePath]
  );

  const summaryText = useMemo(() => {
    const { added, deleted, modified } = preview.summary;
    const targetTime = preview.toCheckpoint.createdAt
      ? formatRelativeTime(preview.toCheckpoint.createdAt)
      : 'unknown time';
    return `Restoring to checkpoint from ${targetTime}: +${added} files, -${deleted} files, ~${modified} modified`;
  }, [preview]);

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="success">+{preview.summary.added} added</Badge>
        <Badge variant="destructive">-{preview.summary.deleted} deleted</Badge>
        <Badge variant="warning">~{preview.summary.modified} modified</Badge>
        <Badge variant="secondary">{preview.summary.unchanged} unchanged</Badge>
        <span className="text-xs text-gray-500 ml-auto">
          Disk impact: {preview.diskSpaceImpact.deltaBytes >= 0 ? '+' : ''}
          {formatBytes(Math.abs(preview.diskSpaceImpact.deltaBytes))}
          {' | '}Est. time: {Math.ceil(preview.estimatedRestoreMs / 1000)}s
        </span>
      </div>

      {/* Summary text */}
      <p className="text-sm text-gray-400">{summaryText}</p>

      <Tabs defaultValue="files" className="w-full">
        <TabsList>
          <TabsTrigger value="files">File Changes</TabsTrigger>
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Filter className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                placeholder="Filter files..."
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button
              variant={showOnlyChanged ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSetShowOnlyChanged(!showOnlyChanged)}
            >
              Changed only
            </Button>
            <Button
              variant={selectableMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectableMode(!selectableMode)}
            >
              Selective
            </Button>
            {selectableMode && (
              <>
                <Button variant="outline" size="sm" onClick={onSelectAllChanged}>
                  Select all changed
                </Button>
                <Button variant="outline" size="sm" onClick={onClearSelection}>
                  Clear
                </Button>
                {selectedFiles.size > 0 && (
                  <Badge variant="default">{selectedFiles.size} selected</Badge>
                )}
              </>
            )}
          </div>

          {/* Two-panel layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Panel: File Tree */}
            <Card className="overflow-hidden">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  File Tree
                  <span className="ml-2 text-xs text-gray-600">
                    ({preview.summary.totalFiles} files)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto px-2 pb-2">
                  {filteredTree.children.size === 0 ? (
                    <p className="text-sm text-gray-500 px-3 py-4">No files match filter</p>
                  ) : (
                    Array.from(filteredTree.children.values()).map((child) => (
                      <FileTreeItem
                        key={child.path}
                        node={child}
                        depth={0}
                        selectedPath={selectedFilePath}
                        onSelectFile={setSelectedFilePath}
                        selectedFiles={selectedFiles}
                        onToggleSelect={onToggleFileSelection}
                        onSelectAllInFolder={onSelectAllInFolder}
                        onDeselectAllInFolder={onDeselectAllInFolder}
                        showOnlyChanged={showOnlyChanged}
                        selectableMode={selectableMode}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Right Panel: Diff Preview */}
            <Card className="overflow-hidden">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  {selectedFile ? (
                    <span className="flex items-center gap-2">
                      {getStatusIcon(selectedFile.status)}
                      <span className={getStatusColor(selectedFile.status)}>
                        {selectedFile.path}
                      </span>
                      <Badge variant={getStatusBadgeVariant(selectedFile.status)} className="ml-auto">
                        {selectedFile.status}
                      </Badge>
                    </span>
                  ) : (
                    'Select a file to view diff'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  {!selectedFile && (
                    <div className="flex items-center justify-center py-16 text-gray-600">
                      <div className="text-center">
                        <File className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Click a file in the tree to preview changes</p>
                      </div>
                    </div>
                  )}
                  {selectedFile && !selectedFile.diff && (
                    <div className="flex items-center justify-center py-16 text-gray-600">
                      <div className="text-center">
                        <p className="text-sm">
                          {selectedFile.status === 'unchanged'
                            ? 'File is unchanged'
                            : selectedFile.status === 'added'
                            ? 'New file (no diff available)'
                            : selectedFile.status === 'deleted'
                            ? 'File will be deleted'
                            : 'Diff not available for this file'}
                        </p>
                        <p className="text-xs text-gray-700 mt-1">
                          Size: {formatBytes(selectedFile.size)}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedFile && selectedFile.diff && (
                    <DiffViewer diff={selectedFile.diff} />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="conversation">
          {!preview.conversation ? (
            <p className="text-sm text-gray-500 py-4">Conversation data not available.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Current State */}
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">
                    Current State
                    <Badge variant="secondary" className="ml-2">
                      {preview.conversation.currentMessageCount} messages
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {preview.conversation.messagesCurrent.length === 0 ? (
                      <p className="text-xs text-gray-600 py-2">No messages</p>
                    ) : (
                      preview.conversation.messagesCurrent.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded border border-gray-800 bg-gray-900 p-2 text-xs"
                        >
                          <div className="text-gray-500 mb-1">
                            {msg.role} -- {formatRelativeTime(msg.timestamp)}
                          </div>
                          <div className="text-gray-300 line-clamp-3">{msg.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Restore Target */}
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">
                    Restore Target
                    <Badge variant="default" className="ml-2">
                      {preview.conversation.targetMessageCount} messages
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {preview.conversation.messagesRestored.length === 0 ? (
                      <p className="text-xs text-gray-600 py-2">No messages</p>
                    ) : (
                      preview.conversation.messagesRestored.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded border border-gray-800 bg-gray-900 p-2 text-xs"
                        >
                          <div className="text-gray-500 mb-1">
                            {msg.role} -- {formatRelativeTime(msg.timestamp)}
                          </div>
                          <div className="text-gray-300 line-clamp-3">{msg.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
