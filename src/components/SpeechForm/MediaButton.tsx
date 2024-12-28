import React from 'react';
import { Music, Video, Link } from 'lucide-react';

interface MediaButtonProps {
  type: 'audio' | 'video' | 'url';
  onClick: () => void;
}

export const MediaButton = ({ type, onClick }: MediaButtonProps) => {
  const icons = {
    audio: Music,
    video: Video,
    url: Link,
  };

  const labels = {
    audio: 'Upload Audio',
    video: 'Upload Video',
    url: 'Add URL',
  };

  const Icon = icons[type];

  return (
    <button
      onClick={onClick}
      className="flex-1 py-3 px-4 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
    >
      <Icon className="w-5 h-5" />
      <span>{labels[type]}</span>
    </button>
  );
};