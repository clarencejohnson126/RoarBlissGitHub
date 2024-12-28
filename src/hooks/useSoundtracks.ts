import { useState, useEffect } from 'react';
import { soundtracks as initialSoundtracks } from '../data/soundtracks';
import { SpotifyTracksService } from '../services/spotify/tracks';
import type { Soundtrack } from '../types';

export const useSoundtracks = () => {
  const [soundtracks, setSoundtracks] = useState<Soundtrack[]>(initialSoundtracks);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initializeSoundtracks = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const updatedSoundtracks = await SpotifyTracksService.initializeSoundtracks(initialSoundtracks);
        
        if (mounted) {
          setSoundtracks(updatedSoundtracks);
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to load soundtracks. Please try again later.');
          console.error('Soundtrack initialization error:', err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeSoundtracks();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    soundtracks,
    isLoading,
    error
  };
};