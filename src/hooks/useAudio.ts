import { useState, useEffect, useCallback } from 'react';
import { AudioService } from '../services/audio/AudioService';
import { AudioError } from '../services/audio/errors';
import type { AudioOptions } from '../services/audio/types';

export const useAudio = (options: AudioOptions = {}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      AudioService.stopCurrent();
    };
  }, []);

  const play = useCallback(async (url: string) => {
    try {
      setError(null);
      await AudioService.loadAndPlay(url, options);
      setIsPlaying(true);
    } catch (err) {
      const message = err instanceof AudioError 
        ? err.message 
        : 'Failed to play audio';
      setError(message);
      setIsPlaying(false);
      throw err;
    }
  }, [options]);

  const stop = useCallback(() => {
    AudioService.stopCurrent();
    setIsPlaying(false);
    setError(null);
  }, []);

  return {
    play,
    stop,
    isPlaying,
    error
  };
};