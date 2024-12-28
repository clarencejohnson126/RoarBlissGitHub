export class ElevenLabsError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ElevenLabsError) {
    return error.message;
  }
  return 'An unexpected error occurred during speech generation';
};