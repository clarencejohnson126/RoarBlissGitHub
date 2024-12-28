import { AudioError } from './errors';
import type { AudioOptions } from './types';

export const createAudio = (url: string, options: AudioOptions = {}): HTMLAudioElement => {
  const audio = new Audio();
  audio.crossOrigin = options.crossOrigin || 'anonymous';
  audio.volume = options.volume ?? 0.7; // Set default volume to 70%
  audio.src = url;
  return audio;
};

export const loadAudio = (audio: HTMLAudioElement): Promise<HTMLAudioElement> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new AudioError('Audio loading timed out'));
    }, 15000); // Increase timeout to 15 seconds

    const onCanPlay = () => {
      cleanup();
      resolve(audio);
    };

    const onError = () => {
      cleanup();
      const errorMessage = audio.error?.message || 'MEDIA_ELEMENT_ERROR: Format error';
      reject(new AudioError(`Failed to load audio: ${errorMessage}`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      audio.removeEventListener('canplaythrough', onCanPlay);
      audio.removeEventListener('error', onError);
    };

    audio.addEventListener('canplaythrough', onCanPlay, { once: true });
    audio.addEventListener('error', onError, { once: true });
    
    // Explicitly set CORS policy
    audio.crossOrigin = 'anonymous';
    audio.load();
  });
};

export const playAudio = async (audio: HTMLAudioElement): Promise<void> => {
  try {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
  } catch (error) {
    console.error('Playback error:', error);
    throw new AudioError('Playback failed - please try again');
  }
};