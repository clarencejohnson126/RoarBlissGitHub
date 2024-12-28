import React from 'react';
import { X, Play, Pause, FileText } from 'lucide-react';

interface FilePreviewProps {
  file: {
    name: string;
    size: number;
    type: string;
    url?: string;
  };
  onRemove: () => void;
}

export const FilePreview = ({ file, onRemove }: FilePreviewProps) => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-purple-300" />
          <div>
            <p className="text-white font-medium">{file.name}</p>
            <p className="text-white/60 text-sm">{formatFileSize(file.size)}</p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-white/60 hover:text-white/90 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {file.type.startsWith('audio/') && file.url && (
        <div className="mt-2">
          <audio ref={audioRef} src={file.url} className="hidden" />
          <button
            onClick={handlePlayPause}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 text-purple-300 rounded-md hover:bg-purple-500/30 transition-colors"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Play</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};