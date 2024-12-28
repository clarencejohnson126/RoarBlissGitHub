import { TextToSpeechOptions } from './types';
import { ElevenLabsError } from './errors';

export const validateTextToSpeechRequest = (options: TextToSpeechOptions): void => {
  if (!options.text?.trim()) {
    throw new ElevenLabsError('Text is required for speech generation', 400);
  }

  if (!options.voiceId?.trim()) {
    throw new ElevenLabsError('Voice ID is required for speech generation', 400);
  }
};