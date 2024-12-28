import { TextToSpeechOptions } from '../types';
import { ElevenLabsError } from '../errors/types';

export const validateTextToSpeechRequest = (options: TextToSpeechOptions): void => {
  if (!options.text?.trim()) {
    throw new ElevenLabsError('Text is required for speech generation', 400);
  }

  if (!options.voiceId?.trim()) {
    throw new ElevenLabsError('Voice ID is required for speech generation', 400);
  }

  // Validate text length
  if (options.text.length > 5000) {
    throw new ElevenLabsError('Text exceeds maximum length of 5000 characters', 400);
  }
};