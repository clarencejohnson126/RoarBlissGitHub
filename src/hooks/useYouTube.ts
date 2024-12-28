import { useState, useCallback } from 'react';
import { YouTubeService } from '../services/media/youtube';
import type { YouTubeMetadata } from '../services/media/types';

export const useYouTube = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(null);

  const processUrl = useCallback(async (url: string): Promise<YouTubeMetadata> => {
    try {
      setIsProcessing(true);
      setError(null);
      
      // Basic URL validation
      if (!url.trim()) {
        throw new Error('Please enter a YouTube URL');
      }

      const videoMetadata = await YouTubeService.getVideoMetadata(url);
      
      // Create a new object to avoid any potential cloning issues
      const safeMetadata: YouTubeMetadata = {
        videoId: videoMetadata.videoId,
        title: videoMetadata.title,
        duration: videoMetadata.duration,
        thumbnail: videoMetadata.thumbnail,
        description: videoMetadata.description
      };

      setMetadata(safeMetadata);
      return safeMetadata;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process YouTube URL';
      setError(message);
      throw new Error(message);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setMetadata(null);
    setError(null);
  }, []);

  return {
    processUrl,
    reset,
    isProcessing,
    error,
    metadata
  };
};