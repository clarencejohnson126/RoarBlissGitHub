import type { SpeechInput } from '../types';

export const validateSpeechInput = (input: Partial<SpeechInput>): string[] => {
  const errors: string[] = [];

  if (!input.name?.trim()) {
    errors.push('Name is required');
  }

  if (!input.goal?.trim()) {
    errors.push('Goal is required');
  }

  if (!input.voice) {
    errors.push('Please select a voice');
  }

  if (input.speechSource === 'custom' && !input.customText?.trim()) {
    errors.push('Custom speech text is required');
  }

  return errors;
};