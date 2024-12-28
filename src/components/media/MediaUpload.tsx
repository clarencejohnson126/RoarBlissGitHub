import React, { useState, useCallback } from 'react';
import { Music, Video, Link, Loader2 } from 'lucide-react';
import { MediaButton } from './MediaButton';
import { FilePreview } from './FilePreview';
import { VideoPreview } from './VideoPreview';
import { URLInput } from './URLInput';
import { useMediaUpload } from '../../hooks/useMediaUpload';
import { useYouTube } from '../../hooks/useYouTube';
import type { YouTubeMetadata } from '../../services/media/types';

interface MediaUploadProps {
  onUpload: (url: string) => void;
}

export const MediaUpload = ({ onUpload }: MediaUploadProps) => {
  const { uploadFile, isUploading } = useMediaUpload();
  const { processUrl, isProcessing, error } = useYouTube();
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: number;
    type: string;
    url?: string;
  } | null>(null);
  const [youtubeMetadata, setYoutubeMetadata] = useState<YouTubeMetadata | null>(null);

  const handleFileUpload = useCallback(async (file: File, type: 'audio' | 'video') => {
    try {
      const result = await uploadFile(file);
      setUploadedFile({
        name: file.name,
        size: file.size,
        type: file.type,
        url: result.url
      });
      onUpload(result.url);
    } catch (error) {
      console.error(`${type} upload failed:`, error);
      alert(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [uploadFile, onUpload]);

  const handleUrlSubmit = useCallback(async (url: string) => {
    try {
      const metadata = await processUrl(url);
      setYoutubeMetadata(metadata);
      onUpload(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to process YouTube URL');
    }
  }, [processUrl, onUpload]);

  const handleRemoveMedia = useCallback(() => {
    setUploadedFile(null);
    setYoutubeMetadata(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <MediaButton
          icon={Music}
          label={isUploading ? 'Uploading...' : 'Upload Audio'}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFileUpload(file, 'audio');
            };
            input.click();
          }}
          disabled={isUploading || isProcessing}
        />
        <MediaButton
          icon={Video}
          label={isUploading ? 'Uploading...' : 'Upload Video'}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFileUpload(file, 'video');
            };
            input.click();
          }}
          disabled={isUploading || isProcessing}
        />
      </div>

      <URLInput
        onSubmit={handleUrlSubmit}
        isProcessing={isProcessing}
      />

      {error && (
        <div className="text-red-400 text-sm px-3 py-2 bg-red-400/10 rounded-lg">
          {error}
        </div>
      )}

      {uploadedFile && (
        <FilePreview
          file={uploadedFile}
          onRemove={handleRemoveMedia}
        />
      )}

      {youtubeMetadata && (
        <VideoPreview
          metadata={youtubeMetadata}
          onRemove={handleRemoveMedia}
        />
      )}
    </div>
  );
};