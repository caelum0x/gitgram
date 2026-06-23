'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { APIClient } from '@/lib/api';
import { useTimeline } from '@/store/timeline';
import FileBrowser from '@/components/FileBrowser';
import DiffViewer from '@/components/DiffViewer';

const TimelineVisualizer = dynamic(() => import('@/components/TimelineVisualizer'), { ssr: false });

export default function Home() {
  const { checkpoints, currentIndex, setCheckpoints, goTo, setLoading, loading } = useTimeline();
  const [client] = useState(() => new APIClient());
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [view, setView] = useState<'files' | 'diff'>('files');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    loadCheckpoints();
    client.subscribeToCheckpoints(() => loadCheckpoints());
    setConnected(true);
    return () => { client.disconnect(); setConnected(false); };
  }, []);

  const loadCheckpoints = async () => {
    setLoading(true);
    try {
      const data = await client.getCheckpoints();
      setCheckpoints(data);
    } catch (e) {
      console.error('Failed to load checkpoints:', e);
    }
    setLoading(false);
  };

  const handleSelect = async (index: number) => {
    goTo(index);
    const cp = checkpoints[index];
    if (!cp) return;
    const details = await client.getCheckpoint(cp.id);
    setSelectedCheckpoint(details);
    setSelectedFile(null);
    setFileContent(null);
    setDiff(null);
    setView('files');
  };

  const handleFileSelect = async (path: string) => {
    if (!selectedCheckpoint) return;
    setSelectedFile(path);
    const content = await client.getFile(selectedCheckpoint.id, path);
    setFileContent(content);
  };

  const handleShowDiff = async () => {
    if (!selectedCheckpoint || currentIndex === 0) return;
    const prevCp = checkpoints[currentIndex - 1];
    if (!prevCp) return;
    const diffResult = await client.getDiff(selectedCheckpoint.id, prevCp.id);
    setDiff(typeof diffResult === 'string' ? diffResult : JSON.stringify(diffResult, null, 2));
    setView('diff');
  };

  const handleRestore = async () => {
    if (!selectedCheckpoint) return;
    if (!confirm('Restore to this checkpoint? Current changes will be backed up.')) return;
    await client.restore(selectedCheckpoint.id);
    alert('✓ Restored successfully');
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <main className="flex h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Timeline Panel */}
      <div className="w-1/2 h-full relative">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
          <Image src="/icon.png" alt="Gitgram TimeMachine" width={40} height={40} className="rounded-lg" />
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              Gitgram TimeMachine
            </h1>
            <p className="text-gray-500 text-xs">
              {checkpoints.length} checkpoints • {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </p>
          </div>
        </div>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
        <TimelineVisualizer checkpoints={checkpoints} currentIndex={currentIndex} onSelect={handleSelect} />
      </div>

      {/* Details Panel */}
      <div className="w-1/2 flex flex-col border-l border-gray-800/50">
        {/* Header */}
        <div className="p-4 border-b border-gray-800/50 bg-gray-900/30">
          {selectedCheckpoint ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-medium">{selectedCheckpoint.description || 'Checkpoint'}</h2>
                  <p className="text-gray-500 text-sm">{formatTime(selectedCheckpoint.timestamp)}</p>
                </div>
                <span className="text-xs bg-gray-800 px-2 py-1 rounded font-mono">
                  {selectedCheckpoint.id?.slice(0, 12)}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleRestore} className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded text-sm font-medium transition">
                  ↩ Restore
                </button>
                <button onClick={handleShowDiff} disabled={currentIndex === 0} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-medium transition">
                  ⇄ Diff
                </button>
                <div className="flex ml-auto bg-gray-800 rounded overflow-hidden">
                  <button onClick={() => setView('files')} className={`px-3 py-1.5 text-sm transition ${view === 'files' ? 'bg-gray-700' : ''}`}>
                    Files
                  </button>
                  <button onClick={() => setView('diff')} className={`px-3 py-1.5 text-sm transition ${view === 'diff' ? 'bg-gray-700' : ''}`}>
                    Changes
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">← Select a checkpoint from the timeline</p>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {!selectedCheckpoint ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Image src="/icon.png" alt="Gitgram TimeMachine" width={80} height={80} className="mx-auto mb-4 opacity-50" />
                <p className="text-gray-400">Travel through time</p>
                <p className="text-gray-600 text-sm mt-1">Click on any checkpoint to explore</p>
              </div>
            </div>
          ) : view === 'diff' && diff ? (
            <div className="h-full p-4 overflow-auto">
              <DiffViewer diff={diff} />
            </div>
          ) : (
            <div className="flex h-full">
              <div className="w-1/2 h-full border-r border-gray-800/50">
                <FileBrowser
                  files={selectedCheckpoint.files || []}
                  onSelect={handleFileSelect}
                  selectedPath={selectedFile || undefined}
                />
              </div>
              <div className="w-1/2 h-full overflow-auto p-4">
                {fileContent ? (
                  <pre className="text-xs font-mono bg-gray-900/50 p-3 rounded-lg whitespace-pre-wrap border border-gray-800/50">{fileContent}</pre>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-600">
                    Select a file to preview
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
