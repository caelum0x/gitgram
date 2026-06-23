'use client';

interface DiffViewerProps {
  diff: string;
  format?: 'unified' | 'side-by-side';
}

export default function DiffViewer({ diff, format = 'unified' }: DiffViewerProps) {
  if (!diff) return <div className="text-gray-500">No diff available</div>;

  const lines = diff.split('\n');

  return (
    <div className="font-mono text-sm overflow-auto bg-gray-900 p-4 rounded">
      {lines.map((line, i) => {
        let className = 'whitespace-pre';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className += ' bg-green-900/30 text-green-400';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className += ' bg-red-900/30 text-red-400';
        } else if (line.startsWith('@@')) {
          className += ' text-cyan-400';
        } else if (line.startsWith('---') || line.startsWith('+++')) {
          className += ' text-gray-400 font-bold';
        }
        return (
          <div key={i} className={className}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}
