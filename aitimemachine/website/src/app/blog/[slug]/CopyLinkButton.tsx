'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-all"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-400" />
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy link
        </>
      )}
    </button>
  );
}
