import { spotifyConfig } from '../../config/spotify';
import { SpotifyAuthService } from './auth';

export class SpotifyApiService {
  private static async fetch(endpoint: string, options: RequestInit = {}) {
    const token = await SpotifyAuthService.getAccessToken();
    
    const response = await fetch(`${spotifyConfig.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.statusText}`);
    }

    return response.json();
  }

  static async searchTracks(query: string) {
    return this.fetch(`/search?type=track&q=${encodeURIComponent(query)}`);
  }

  static async getTrack(trackId: string) {
    return this.fetch(`/tracks/${trackId}`);
  }

  static async getAudioFeatures(trackId: string) {
    return this.fetch(`/audio-features/${trackId}`);
  }
}