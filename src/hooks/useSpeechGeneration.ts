import { useState, useCallback } from 'react';
import { ElevenLabsService } from '../services/elevenlabs';
import { AudioService } from '../services/audio';
import { TranslationService } from '../services/translation';

export const useSpeechGeneration = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentText, setCurrentText] = useState<string | null>(null);

  const generateSpeech = useCallback(async (
    text: string,
    voiceId: string,
    targetLanguage?: string
  ) => {
    try {
      setIsGenerating(true);
      setError(null);

      // Stop any currently playing audio
      AudioService.stopCurrentAudio();

      // Translate text if target language is specified
      let finalText = text;
      if (targetLanguage && targetLanguage !== 'en') {
        try {
          const result = await TranslationService.translateText({
            text,
            targetLanguage
          });
          finalText = result.translatedText;
          setCurrentText(finalText);
        } catch (error) {
          console.error('Translation error:', error);
          // Continue with original text if translation fails
          setError('Translation failed, using original text');
        }
      } else {
        setCurrentText(finalText);
      }

      // Generate and play audio
      const audio = await ElevenLabsService.textToSpeech({
        text: finalText,
        voiceId,
      });

      AudioService.setCurrentAudio(audio);
      await audio.play();

      return audio;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate speech';
      setError(errorMessage);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    isGenerating,
    error,
    currentText,
    generateSpeech
  };
};