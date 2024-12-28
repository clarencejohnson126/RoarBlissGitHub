import { getTranslationClient } from './client';
import { googleCloudConfig } from '../../config/google-cloud';
import { TranslationError } from './errors';
import { validateTranslationRequest, validateDetectionRequest } from './validation';
import type { TranslationRequest, DetectionRequest, TranslationResult } from './types';

export class TranslationService {
  static async translateText(request: TranslationRequest): Promise<TranslationResult> {
    try {
      validateTranslationRequest(request);
      
      const client = await getTranslationClient();
      const [response] = await client.translateText({
        parent: `projects/${googleCloudConfig.projectId}/locations/global`,
        contents: [request.text],
        mimeType: 'text/plain',
        targetLanguageCode: request.targetLanguage,
        sourceLanguageCode: request.sourceLanguage
      });

      const translation = response.translations?.[0];
      if (!translation?.translatedText) {
        throw new TranslationError('No translation received from service');
      }

      return {
        translatedText: translation.translatedText,
        detectedSourceLanguage: translation.detectedLanguageCode
      };
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw new TranslationError('Translation failed', error);
    }
  }

  static async detectLanguage(request: DetectionRequest): Promise<string> {
    try {
      validateDetectionRequest(request);
      
      const client = await getTranslationClient();
      const [response] = await client.detectLanguage({
        parent: `projects/${googleCloudConfig.projectId}/locations/global`,
        content: request.text
      });

      const detectedLanguage = response.languages?.[0]?.languageCode;
      if (!detectedLanguage) {
        throw new TranslationError('No language detected');
      }

      return detectedLanguage;
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw new TranslationError('Language detection failed', error);
    }
  }
}