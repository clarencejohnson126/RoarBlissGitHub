export interface AudioOptions {
  volume?: number;
  autoplay?: boolean;
  crossOrigin?: 'anonymous' | 'use-credentials' | '';
}

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}