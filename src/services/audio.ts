export class AudioService {
  private static currentAudio: HTMLAudioElement | null = null;

  static setCurrentAudio(audio: HTMLAudioElement) {
    this.currentAudio = audio;
    
    // Clean up when audio ends
    audio.addEventListener('ended', () => {
      this.currentAudio = null;
    });
  }

  static stopCurrentAudio() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
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