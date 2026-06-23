'use client';

import { useState } from 'react';
import api from '@/services/api';
import { toast } from 'react-hot-toast';

const reactions = [
  { type: 'heart', emoji: '❤️' },
  { type: 'fire', emoji: '🔥' },
  { type: 'laugh', emoji: '😂' },
  { type: 'wow', emoji: '😮' },
  { type: 'sad', emoji: '😢' },
  { type: 'angry', emoji: '😠' },
];

export default function StoryReactions({ storyId, onReact }: { storyId: string; onReact?: () => void }) {
  const [showReactions, setShowReactions] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [reply, setReply] = useState('');

  const handleReact = async (type: string) => {
    try {
      await api.post(`/stories/${storyId}/react`, { type });
      toast.success('Reacted!');
      setShowReactions(false);
      onReact?.();
    } catch (error) {
      toast.error('Failed to react');
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;

    try {
      await api.post(`/stories/${storyId}/reply`, { content: reply });
      toast.success('Reply sent!');
      setReply('');
      setShowReply(false);
    } catch (error) {
      toast.error('Failed to send reply');
    }
  };

  return (
    <div className="absolute bottom-4 left-0 right-0 px-4">
      {showReactions && (
        <div className="bg-white rounded-full p-2 mb-2 flex justify-around shadow-lg">
          {reactions.map((r) => (
            <button
              key={r.type}
              onClick={() => handleReact(r.type)}
              className="text-2xl hover:scale-125 transition"
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}

      {showReply ? (
        <form onSubmit={handleReply} className="flex gap-2">
          <input
            type="text"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Send a reply..."
            className="flex-1 p-2 rounded-full border"
            autoFocus
          />
          <button type="submit" className="bg-blue-500 text-white px-4 rounded-full">
            Send
          </button>
          <button
            type="button"
            onClick={() => setShowReply(false)}
            className="bg-gray-300 px-4 rounded-full"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="flex-1 bg-white/20 backdrop-blur text-white p-2 rounded-full"
          >
            React
          </button>
          <button
            onClick={() => setShowReply(true)}
            className="flex-1 bg-white/20 backdrop-blur text-white p-2 rounded-full"
          >
            Reply
          </button>
        </div>
      )}
    </div>
  );
}
