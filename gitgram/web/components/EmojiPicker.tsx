'use client';

import { useState } from 'react';

const emojis = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '👍', '👎', '👏', '🙌', '🤝', '💪', '🙏', '✨',
  '🔥', '💯', '✅', '❌', '⭐', '🎉', '🎊', '🎈',
];

export default function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-2xl hover:scale-110 transition"
      >
        😊
      </button>

      {show && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShow(false)}
          />
          <div className="absolute bottom-full mb-2 right-0 bg-white rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1 z-20">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelect(emoji);
                  setShow(false);
                }}
                className="text-2xl hover:scale-125 transition p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
