import { TranslationRequest, DetectionRequest } from './types';
import { TranslationError } from './errors';

export const validateTranslationRequest = (request: TranslationRequest): void => {
  if (!request.text?.trim()) {
    throw new TranslationError('Text is required for translation');
  }
  if (!request.targetLanguage?.trim()) {
    throw new TranslationError('Target language is required');
  }
};

export const validateDetectionRequest = (request: DetectionRequest): void => {
  if (!request.text?.trim()) {
    throw new TranslationError('Text is required for language detection');
  }
};