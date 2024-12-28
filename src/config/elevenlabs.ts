import { env } from './env';

if (!env.ELEVENLABS_API_KEY) {
  console.error('ELEVENLABS_API_KEY is not set in environment variables');
}

export const elevenLabsConfig = {
  apiKey: env.ELEVENLABS_API_KEY,
  apiUrl: 'https://api.elevenlabs.io/v1',
  defaultVoiceSettings: {
    stability: 0.75,
    similarity_boost: 0.75
  },
  model: {
    id: "eleven_multilingual_v2",
    settings: {
      use_speaker_boost: true,
      style: 1.0,
      speaking_rate: 1.0
    }
  },
  voices: {
    'ukONT0PiO5smfFLmTj12': {
      name: 'Kris',
      settings: {
        stability: 0.8,
        similarity_boost: 0.8
      }
    },
    'FF7KdobWPaiR0vkcALHF': {
      name: 'David',
      settings: {
        stability: 0.7,
        similarity_boost: 0.7
      }
    }
  }
} as const;