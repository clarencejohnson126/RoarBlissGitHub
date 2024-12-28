import { AxiosError } from 'axios';
import { ElevenLabsError } from './types';

export const handleElevenLabsError = (error: unknown): never => {
  // Log the raw error first for debugging
  console.error('Raw ElevenLabs error:', {
    error,
    type: error instanceof Error ? error.constructor.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });

  if (error instanceof ElevenLabsError) {
    throw error;
  }

  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data;
    
    // Log detailed API response for debugging
    console.error('ElevenLabs API Response:', {
      status,
      data,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    
    switch (status) {
      case 401:
        throw new ElevenLabsError(
          `Authentication failed: ${data?.detail || 'Invalid API key or unauthorized access'}`,
          status,
          error
        );
      case 429:
        throw new ElevenLabsError(
          `Rate limit exceeded: ${data?.detail || 'Please try again later'}`,
          status,
          error
        );
      case 400: {
        const message = data?.detail || 'Invalid request parameters';
        throw new ElevenLabsError(message, status, error);
      }
      case 503:
        throw new ElevenLabsError(
          'ElevenLabs service is temporarily unavailable. Please try again later.',
          status,
          error
        );
      default:
        throw new ElevenLabsError(
          `Speech generation failed (${status}): ${data?.detail || error.message}`,
          status,
          error
        );
    }
  }
  
  throw new ElevenLabsError(
    'Unexpected error during speech generation: ' + (error instanceof Error ? error.message : String(error)),
    500,
    error
  );
}