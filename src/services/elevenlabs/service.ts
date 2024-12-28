import axios from 'axios';
import { elevenLabsConfig } from '../../config/elevenlabs';
import { TextToSpeechOptions } from './types';
import { validateTextToSpeechRequest } from './validation/validateRequest';
import { validateApiKey } from './validation/validateApiKey';
import { handleElevenLabsError } from './errors/handlers';

export class ElevenLabsService {
  static async textToSpeech(options: TextToSpeechOptions): Promise<HTMLAudioElement> {
    try {
      // Get and validate API key
      const apiKey = validateApiKey();
      
      // Validate request parameters
      validateTextToSpeechRequest(options);

      const response = await axios.post(
        `${elevenLabsConfig.apiUrl}/text-to-speech/${options.voiceId}`,
        {
          text: options.text,
          model_id: elevenLabsConfig.model.id,
          voice_settings: elevenLabsConfig.defaultVoiceSettings
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 30000 // 30 second timeout
        }
      );

      if (!response.data) {
        throw new Error('No audio data received');
      }

      const blob = new Blob([response.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      // Clean up URL when audio is no longer needed
      audio.onended = () => URL.revokeObjectURL(url);
      
      return audio;
    } catch (error) {
      console.error('ElevenLabs API Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        status: axios.isAxiosError(error) ? error.response?.status : undefined
      });
      throw handleElevenLabsError(error);
    }
  }
}