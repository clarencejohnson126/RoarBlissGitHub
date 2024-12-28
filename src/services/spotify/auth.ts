import { spotifyConfig } from '../../config/spotify';

export class SpotifyAuthService {
  private static accessToken: string | null = null;
  private static tokenExpiry: number | null = null;

  static async getAccessToken(): Promise<string> {
    // Return existing token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(spotifyConfig.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${spotifyConfig.clientId}:${spotifyConfig.clientSecret}`)
        },
        body: 'grant_type=client_credentials'
      });

      if (!response.ok) {
        throw new Error('Failed to get Spotify access token');
      }

      const data = await response.json();
      
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('Spotify authentication error:', error);
      throw new Error('Failed to authenticate with Spotify');
    }
  }

  static clearToken(): void {
    this.accessToken = null;
    this.tokenExpiry = null;
  }
}