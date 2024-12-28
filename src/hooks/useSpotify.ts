import { useState, useCallback } from 'react';
import { SpotifyApiService } from '../services/spotify/api';

export const useSpotify = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTracks = useCallback(async (query: string) => {
    try {
      setIsLoading(true);
      setError(null);
      return await SpotifyApiService.searchTracks(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search tracks');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getTrack = useCallback(async (trackId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      return await SpotifyApiService.getTrack(trackId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get track');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    searchTracks,
    getTrack,
    isLoading,
    error
  };
};