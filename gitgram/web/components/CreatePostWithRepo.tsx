'use client';

import { useState } from 'react';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import dynamic from 'next/dynamic';
import { parseRepositoryInput } from '@/utils/repositoryRouting';

const GifPicker = dynamic(() => import('./GifPicker'), { ssr: false });

export default function CreatePostWithRepo() {
  const [content, setContent] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [gifUrl, setGifUrl] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const repo = parseRepositoryInput(repoUrl);
      if (!repo) {
        setError('Invalid repository reference');
        setLoading(false);
        return;
      }

      await api.post('/posts', {
        content,
        repoOwner: repo.owner,
        repoName: repo.name,
        gifUrl: gifUrl || undefined,
      });

      setContent('');
      setRepoUrl('');
      setGifUrl('');
      window.location.reload(); // Refresh feed
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGifSelect = (url: string) => {
    setGifUrl(url);
    setShowGifPicker(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What do you think about this project?"
          className="w-full p-3 border rounded-lg resize-none"
          rows={3}
          required
        />

        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="GitHub URL or owner/repo (e.g., https://github.com/microsoft/vscode)"
          className="w-full p-3 border rounded-lg mt-2"
        />

        {gifUrl && (
          <div className="mt-2 relative">
            <img src={gifUrl} alt="Selected GIF" className="rounded-lg max-h-48" />
            <button
              type="button"
              onClick={() => setGifUrl('')}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm mt-2">{error}</p>
        )}

        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => setShowGifPicker(true)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <span className="text-lg">🎞️</span>
            GIF
          </button>

          <button
            type="submit"
            disabled={loading || !content}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>

      {showGifPicker && (
        <GifPicker
          onSelect={handleGifSelect}
          onClose={() => setShowGifPicker(false)}
        />
      )}
    </div>
  );
}
