import React from 'react';
import { X, Play, ExternalLink } from 'lucide-react';
import type { YouTubeMetadata } from '../../services/media/types';

interface VideoPreviewProps {
  metadata: YouTubeMetadata;
  onRemove: () => void;
}

export const VideoPreview = ({ metadata, onRemove }: VideoPreviewProps) => {
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
      <div className="relative group">
        <img
          src={metadata.thumbnail}
          alt={metadata.title}
          className="w-full aspect-video object-cover"
        />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={`https://youtube.com/watch?v=${metadata.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <Play className="w-8 h-8 text-white" />
          </a>
        </div>
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded text-white text-sm">
          {formatDuration(metadata.duration)}
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-white font-medium line-clamp-2">{metadata.title}</h3>
            {metadata.description && (
              <p className="text-white/70 text-sm mt-1 line-clamp-2">
                {metadata.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://youtube.com/watch?v=${metadata.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white/90 transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button
              onClick={onRemove}
              className="text-white/60 hover:text-white/90 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};