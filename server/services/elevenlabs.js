import axios from 'axios';
import { env } from '../config/env.js';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export class ElevenLabsService {
  static async generateSpeech(text, voiceId) {
    try {
      const response = await axios.post(
        `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
        {
          text,
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.85
          }
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

      return Buffer.from(response.data).toString('base64');
    } catch (error) {
      console.error('ElevenLabs API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  static async getVoices() {
    try {
      const response = await axios.get(
        `${ELEVENLABS_API_URL}/voices`,
        {
          headers: {
            'xi-api-key': env.ELEVENLABS_API_KEY
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to fetch voices:', error.response?.data || error.message);
      throw error;
    }
  }
}