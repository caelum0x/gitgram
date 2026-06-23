'use client';

import { useState, useEffect } from 'react';

export default function ScheduledPostsPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    const res = await fetch('/api/scheduled-posts', {
      credentials: 'include',
    });
    const data = await res.json();
    setPosts(data);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/scheduled-posts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mediaUrls: [], scheduledFor }),
    });
    setContent('');
    setScheduledFor('');
    fetchPosts();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/scheduled-posts/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    fetchPosts();
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Scheduled Posts</h1>

      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-8">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full border rounded p-3 mb-4"
          rows={4}
          required
        />
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="border rounded px-4 py-2 mb-4"
          required
        />
        <button type="submit" className="bg-blue-500 text-white px-6 py-2 rounded">
          Schedule Post
        </button>
      </form>

      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <p className="mb-2">{post.content}</p>
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Scheduled for: {new Date(post.scheduledFor).toLocaleString()}</span>
              <button onClick={() => handleDelete(post.id)} className="text-red-500">Delete</button>
            </div>
          </div>
        ))}
        {posts.length === 0 && (
          <div className="text-center text-gray-500 py-8">No scheduled posts</div>
        )}
      </div>
    </div>
  );
}
