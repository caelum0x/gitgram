'use client';

import { useState } from 'react';

interface FileBrowserProps {
  files: Array<{ path: string; hash: string; size: number }>;
  onSelect: (path: string) => void;
  selectedPath?: string;
}

export default function FileBrowser({ files, onSelect, selectedPath }: FileBrowserProps) {
  const [filter, setFilter] = useState('');
  
  const filtered = files.filter(f => 
    f.path.toLowerCase().includes(filter.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="h-full flex flex-col">
      <input
        type="text"
        placeholder="Filter files..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full p-2 mb-2 bg-gray-800 border border-gray-700 rounded text-white"
      />
      <div className="flex-1 overflow-y-auto">
        {filtered.map((file) => (
          <div
            key={file.path}
            onClick={() => onSelect(file.path)}
            className={`p-2 cursor-pointer hover:bg-gray-800 border-b border-gray-800 ${
              selectedPath === file.path ? 'bg-blue-900' : ''
            }`}
          >
            <div className="text-sm truncate">{file.path}</div>
            <div className="text-xs text-gray-500">{formatSize(file.size)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
