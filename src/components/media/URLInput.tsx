import React, { useState } from 'react';
import { Link, Loader2 } from 'lucide-react';

interface URLInputProps {
  onSubmit: (url: string) => Promise<void>;
  isProcessing: boolean;
}

export const URLInput = ({ onSubmit, isProcessing }: URLInputProps) => {
  const [url, setUrl] = useState('');

  const handleSubmit = async () => {
    if (url.trim()) {
      await onSubmit(url.trim());
      setUrl('');
    }
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <Link className="w-5 h-5 text-white/60" />
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Enter YouTube URL..."
          className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          disabled={isProcessing}
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isProcessing || !url.trim()}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          isProcessing || !url.trim()
            ? 'bg-purple-500/50 cursor-not-allowed'
            : 'bg-purple-500 hover:bg-purple-600'
        } text-white flex items-center gap-2`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Add URL'
        )}
      </button>
    </div>
  );
};