export class TranslationError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'TranslationError';
  }
}