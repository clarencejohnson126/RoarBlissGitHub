import { AudioError } from './errors';
import { createAudio, loadAudio, playAudio } from './core';
import type { AudioOptions } from './types';

export class AudioService {
  private static currentAudio: HTMLAudioElement | null = null;

  static async loadAndPlay(url: string, options: AudioOptions = {}): Promise<HTMLAudioElement> {
    try {
      if (!url?.trim()) {
        throw new AudioError('Invalid audio URL');
      }

      this.stopCurrent();

      const audio = createAudio(url, options);
      const loadedAudio = await loadAudio(audio);
      
      this.currentAudio = loadedAudio;
      await playAudio(loadedAudio);
      
      return loadedAudio;
    } catch (error) {
      if (error instanceof AudioError) {
        throw error;
      }
      throw new AudioError('Failed to load or play audio');
    }
  }

  static stopCurrent(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
        this.currentAudio = null;
      } catch (error) {
        console.error('Error stopping audio:', error);
      }
    }
  }

  static isPlaying(): boolean {
    return !!(this.currentAudio && !this.currentAudio.paused);
  }
}