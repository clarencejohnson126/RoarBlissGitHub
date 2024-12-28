import React from 'react';
import { Music, Video, Link } from 'lucide-react';

interface MediaUploadProps {
  type: 'audio' | 'video' | 'url';
  onUpload: (file: File | string) => void;
}

export const MediaUpload = ({ type, onUpload }: MediaUploadProps) => {
  const handleClick = () => {
    if (type === 'url') {
      const url = window.prompt('Enter URL:');
      if (url) {
        onUpload(url);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = type === 'audio' ? 'audio/*' : 'video/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          onUpload(file);
        }
      };
      input.click();
    }
  };

  const icons = {
    audio: Music,
    video: Video,
    url: Link
  };

  const labels = {
    audio: 'Upload Audio',
    video: 'Upload Video',
    url: 'Add URL'
  };

  const Icon = icons[type];

  return (
    <button
      onClick={handleClick}
      className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-white/20 rounded-lg hover:border-white/40 transition-colors"
    >
      <Icon className="w-6 h-6 text-white mb-2" />
      <span className="text-sm text-white">{labels[type]}</span>
    </button>
  );
};