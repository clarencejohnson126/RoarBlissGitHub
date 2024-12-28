export const spotifyConfig = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID || 'cb5b5a919d834131b0b602ecf9b9cbd6',
  clientSecret: import.meta.env.VITE_SPOTIFY_CLIENT_SECRET || 'b60bdc93eac048cbb31afaf565bb5423',
  apiUrl: 'https://api.spotify.com/v1',
  authUrl: 'https://accounts.spotify.com/api/token',
  scopes: ['streaming', 'user-read-email', 'user-read-private']
} as const;