import { SpotifyAuthService } from './auth';
import { spotifyConfig } from '../../config/spotify';
import type { Soundtrack } from '../../types';

export class SpotifyTracksService {
  static async getTrack(trackId: string) {
    try {
      const token = await SpotifyAuthService.getAccessToken();
      const response = await fetch(`${spotifyConfig.apiUrl}/tracks/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch track');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get track:', error);
      throw error;
    }
  }

  static async searchTrack(query: string) {
    try {
      const token = await SpotifyAuthService.getAccessToken();
      const response = await fetch(
        `${spotifyConfig.apiUrl}/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to search tracks');
      }

      const data = await response.json();
      return data.tracks.items[0] || null;
    } catch (error) {
      console.error('Failed to search tracks:', error);
      throw error;
    }
  }

  static async initializeSoundtracks(soundtracks: Soundtrack[]): Promise<Soundtrack[]> {
    try {
      const updatedSoundtracks = await Promise.all(
        soundtracks.map(async (soundtrack) => {
          const searchQuery = `${soundtrack.name} ${soundtrack.composer}`;
          const track = await this.searchTrack(searchQuery);
          
          return {
            ...soundtrack,
            previewUrl: track?.preview_url || ''
          };
        })
      );
      
      return updatedSoundtracks.filter(track => track.previewUrl);
    } catch (error) {
      console.error('Failed to initialize soundtracks:', error);
      throw error;
    }
  }
}