'use client';

import { useEffect } from 'react';

export default function AdPost({ ad }: { ad: any }) {
  useEffect(() => {
    // Track impression
    fetch(`/api/advertisements/${ad.id}/impression`, { method: 'POST' });
  }, [ad.id]);

  const handleClick = () => {
    // Track click
    fetch(`/api/advertisements/${ad.id}/click`, { method: 'POST' });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-4 border-2 border-blue-100">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
              Ad
            </div>
            <div>
              <div className="font-bold">Sponsored</div>
              <div className="text-xs text-gray-500">Advertisement</div>
            </div>
          </div>
        </div>

        {ad.mediaUrl && (
          <img src={ad.mediaUrl} alt="Ad" className="w-full rounded-lg mb-3" />
        )}

        <p className="mb-3">{ad.content}</p>

        <button
          onClick={handleClick}
          className="w-full bg-blue-500 text-white py-2 rounded-lg font-medium hover:bg-blue-600"
        >
          Learn More
        </button>
      </div>
    </div>
  );
}
