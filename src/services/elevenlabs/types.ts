export interface TextToSpeechOptions {
  text: string;
  voiceId: string;
}

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
}

export class ElevenLabsError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}