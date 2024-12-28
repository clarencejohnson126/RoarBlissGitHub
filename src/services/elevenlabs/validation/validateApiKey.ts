import { ElevenLabsError } from '../errors/types';
import { env } from '../../../config/env';

export const validateApiKey = (): string => {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  
  if (!apiKey) {
    throw new ElevenLabsError(
      'ElevenLabs API key is missing. Please check your environment variables.',
      401
    );
  }
  
  // Basic format validation for ElevenLabs API key
  if (!/^[a-zA-Z0-9]{32,}$/.test(apiKey)) {
    throw new ElevenLabsError(
      'Invalid ElevenLabs API key format.',
      401
    );
  }

  return apiKey;
};