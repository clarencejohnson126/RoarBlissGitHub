import axios from 'axios';
import { youtubeConfig } from '../../config/youtube';
import type { YouTubeMetadata } from './types';

export class YouTubeService {
  static async getVideoMetadata(url: string): Promise<YouTubeMetadata> {
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL. Please provide a valid YouTube video link.');
      }

      const response = await axios.get(`${youtubeConfig.apiUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails',
          id: videoId,
          key: youtubeConfig.apiKey
        }
      });

      if (!response.data.items?.length) {
        throw new Error('Video not found. Please check the URL and try again.');
      }

      const video = response.data.items[0];
      const duration = this.parseDuration(video.contentDetails.duration);

      // Check if video is too long
      if (duration > youtubeConfig.maxDuration) {
        throw new Error('Video is too long. Please choose a video under 1 hour.');
      }

      const metadata: YouTubeMetadata = {
        videoId,
        title: video.snippet.title,
        duration,
        thumbnail: video.snippet.thumbnails.high.url,
        description: video.snippet.description?.slice(0, 200) // Limit description length
      };

      return metadata;
    } catch (error) {
      console.error('YouTube API Error:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new Error('YouTube API quota exceeded. Please try again later.');
        }
        throw new Error(error.response?.data?.error?.message || 'Failed to fetch video metadata');
      }
      
      throw error instanceof Error ? error : new Error('Failed to process YouTube URL');
    }
  }

  private static extractVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      if (!youtubeConfig.allowedDomains.includes(urlObj.hostname)) {
        return null;
      }

      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.slice(1);
      }
      
      return urlObj.searchParams.get('v');
    } catch {
      return null;
    }
  }

  private static parseDuration(duration: string): number {
    try {
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;

      const [, hours, minutes, seconds] = match;
      return (
        (parseInt(hours || '0') * 3600) +
        (parseInt(minutes || '0') * 60) +
        parseInt(seconds || '0')
      );
    } catch {
      return 0;
    }
  }
}