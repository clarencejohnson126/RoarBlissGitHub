export interface TranslationRequest {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface DetectionRequest {
  text: string;
}

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}