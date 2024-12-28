import axios from 'axios';
import { env } from '../config/env';

interface TranslateTextParams {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export class TranslationService {
  private static API_URL = 'https://translation.googleapis.com/language/translate/v2';

  static async translateText({ text, targetLanguage, sourceLanguage }: TranslateTextParams): Promise<string> {
    try {
      if (!text?.trim()) {
        throw new Error('Text is required for translation');
      }

      if (!targetLanguage?.trim()) {
        throw new Error('Target language is required');
      }

      const response = await axios.post(
        this.API_URL,
        {},
        {
          params: {
            key: env.GOOGLE_CLOUD_API_KEY,
            q: text,
            target: targetLanguage,
            source: sourceLanguage || 'en',
            format: 'text'
          }
        }
      );

      const translatedText = response.data?.data?.translations?.[0]?.translatedText;
      if (!translatedText) {
        throw new Error('No translation received from service');
      }

      return translatedText;
    } catch (error: any) {
      console.error('Translation error:', error.response?.data || error.message);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new Error('Invalid API key or API not enabled');
        }
        throw new Error(`Translation failed: ${error.response?.data?.error?.message || error.message}`);
      }
      throw new Error('Translation failed. Please try again.');
    }
  }
}