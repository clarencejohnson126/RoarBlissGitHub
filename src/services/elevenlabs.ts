import axios from 'axios';
import { env } from '../config/env';

interface TextToSpeechOptions {
  text: string;
  voiceId: string;
}

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
}

export class ElevenLabsService {
  private static API_URL = 'https://api.elevenlabs.io/v1';
  private static DEFAULT_VOICE_SETTINGS: VoiceSettings = {
    stability: 0.75,
    similarity_boost: 0.75
  };

  static async textToSpeech({ text, voiceId }: TextToSpeechOptions): Promise<HTMLAudioElement> {
    if (!env.ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key is not configured');
    }

    if (!text?.trim()) {
      throw new Error('Text is required for speech generation');
    }

    if (!voiceId?.trim()) {
      throw new Error('Voice ID is required for speech generation');
    }

    try {
      // Remove /stream from endpoint as it's not needed
      const response = await axios.post(
        `${this.API_URL}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: this.DEFAULT_VOICE_SETTINGS
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      if (!response.data) {
        throw new Error('No audio data received from ElevenLabs');
      }

      const blob = new Blob([response.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      // Clean up URL when audio is no longer needed
      audio.onended = () => URL.revokeObjectURL(url);
      
      return audio;
    } catch (error) {
      console.error('ElevenLabs API Error:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid ElevenLabs API key');
        }
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (error.response?.status === 400) {
          throw new Error('Invalid request. Please check the text and voice ID.');
        }
        const errorData = error.response?.data;
        const errorMessage = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);
        throw new Error(`Speech generation failed: ${errorMessage}`);
      }
      
      throw error instanceof Error ? error : new Error('Failed to generate speech');
    }
  }
}