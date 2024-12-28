export interface ElevenLabsErrorDetails {
  statusCode?: number;
  message: string;
  originalError?: unknown;
}

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