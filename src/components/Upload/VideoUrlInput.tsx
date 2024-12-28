import React, { useState } from 'react';
import { Video } from 'lucide-react';

interface VideoUrlInputProps {
  onUrlSubmit: (url: string) => void;
}

export const VideoUrlInput = ({ onUrlSubmit }: VideoUrlInputProps) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onUrlSubmit(url.trim());
      setUrl('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <Video className="h-5 w-5 text-white/60" />
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter YouTube or video URL..."
          className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          required
        />
      </div>
      <button
        type="submit"
        className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
      >
        Add Video URL
      </button>
    </form>
  );
};