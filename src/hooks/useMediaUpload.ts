import { useState } from 'react';
import { MediaUploadService } from '../services/media/upload';
import type { MediaUploadResponse, MediaProcessingStatus } from '../services/media/types';

export const useMediaUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<MediaProcessingStatus>('pending');
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File): Promise<MediaUploadResponse> => {
    try {
      setIsUploading(true);
      setStatus('processing');
      setError(null);

      const response = await MediaUploadService.uploadFile(file);
      setStatus('completed');
      return response;
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Upload failed');
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const processYouTubeUrl = async (url: string): Promise<MediaUploadResponse> => {
    try {
      setIsUploading(true);
      setStatus('processing');
      setError(null);

      const response = await MediaUploadService.processYouTubeUrl(url);
      setStatus('completed');
      return response;
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Processing failed');
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFile,
    processYouTubeUrl,
    isUploading,
    progress,
    status,
    error
  };
};