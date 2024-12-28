import { useState, useCallback } from 'react';
import { TranslationService } from '../services/translation';

export const useTranslation = () => {
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translateText = useCallback(async (
    text: string,
    targetLanguage: string
  ): Promise<string> => {
    try {
      setIsTranslating(true);
      setError(null);
      return await TranslationService.translateText(text, targetLanguage);
    } catch (error: any) {
      const errorMessage = error.message || 'Translation failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const detectLanguage = useCallback(async (text: string): Promise<string> => {
    try {
      setIsTranslating(true);
      setError(null);
      return await TranslationService.detectLanguage(text);
    } catch (error: any) {
      const errorMessage = error.message || 'Language detection failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsTranslating(false);
    }
  }, []);

  return {
    translateText,
    detectLanguage,
    isTranslating,
    error,
  };
};