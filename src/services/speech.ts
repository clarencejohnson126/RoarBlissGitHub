import api from './api';
import { createAudioFromBase64 } from '../utils/audio';

interface GenerateSpeechParams {
  text: string;
  voiceId: string;
}

interface GenerateSpeechResponse {
  audioBase64: string;
}

export class SpeechService {
  static async generateSpeech({ text, voiceId }: GenerateSpeechParams): Promise<HTMLAudioElement> {
    try {
      const response = await api.post<GenerateSpeechResponse>('/api/generate-speech', {
        text,
        voiceId,
      });

      return createAudioFromBase64(response.data.audioBase64);
    } catch (error) {
      console.error('Failed to generate speech:', error);
      throw new Error('Failed to generate speech. Please try again.');
    }
  }

  static async getVoices() {
    try {
      const response = await api.get('/api/voices');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch voices:', error);
      throw new Error('Failed to fetch voices. Please try again.');
    }
  }

  static createAudioFromBase64(base64Audio: string): HTMLAudioElement {
    const audio = new Audio();
    audio.src = `data:audio/mpeg;base64,${base64Audio}`;
    return audio;
  }
}