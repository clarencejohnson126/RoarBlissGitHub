import { TranslationServiceClient } from '@google-cloud/translate';
import { googleCloudConfig } from '../../config/google-cloud';
import { TranslationError } from './errors';

let translationClient: TranslationServiceClient | null = null;

export const getTranslationClient = async (): Promise<TranslationServiceClient> => {
  if (!translationClient) {
    try {
      translationClient = new TranslationServiceClient({
        projectId: googleCloudConfig.projectId,
        credentials: googleCloudConfig.credentials
      });
    } catch (error) {
      throw new TranslationError('Failed to initialize translation client', error);
    }
  }
  return translationClient;
};