import { TranslationServiceClient } from '@google-cloud/translate';
import { googleCloudConfig } from '../config/google-cloud';

let translationClient: TranslationServiceClient | null = null;

export const getTranslationClient = async () => {
  if (!translationClient) {
    translationClient = new TranslationServiceClient({
      projectId: googleCloudConfig.projectId,
      credentials: googleCloudConfig.credentials
    });
  }
  return translationClient;
};