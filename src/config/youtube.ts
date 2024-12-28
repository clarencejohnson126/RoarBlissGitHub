import { env } from './env';

export const youtubeConfig = {
  apiKey: env.YOUTUBE_API_KEY || 'AIzaSyAEI0iJUaj-zG65h4IKqtjVK9lQF2Sdi4w',
  apiUrl: 'https://www.googleapis.com/youtube/v3',
  maxDuration: 3600, // 1 hour in seconds
  allowedDomains: ['youtube.com', 'youtu.be', 'www.youtube.com']
};