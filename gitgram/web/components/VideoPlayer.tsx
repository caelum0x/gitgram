'use client';

import { useRef, useState } from 'react';

export default function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        className="w-full"
        loop
        playsInline
        muted={muted}
        onClick={togglePlay}
      />

      <div className="absolute bottom-2 right-2 flex gap-2">
        <button
          onClick={togglePlay}
          className="bg-black/50 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-black/70"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          onClick={toggleMute}
          className="bg-black/50 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-black/70"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  );
}
