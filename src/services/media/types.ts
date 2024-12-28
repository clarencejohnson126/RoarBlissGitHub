export interface MediaUploadResponse {
  url: string;
  type: 'audio' | 'video' | 'url';
  metadata: {
    duration?: number;
    size?: number;
    format?: string;
    title?: string;
  };
}

export interface YouTubeMetadata {
  videoId: string;
  title: string;
  duration: number;
  thumbnail: string;
  description?: string;
}

export type MediaProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';