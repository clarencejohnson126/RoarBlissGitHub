// Environment configuration with type checking
const env = {
  ELEVENLABS_API_KEY: import.meta.env.VITE_ELEVENLABS_API_KEY as string,
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY as string,
  GOOGLE_CLOUD_API_KEY: import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY as string || 'AIzaSyB1wb0Fa1CS7hQPU-Md0A24nLuIQ2gedNk',
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
} as const;

// Helper functions to check API access
export const hasElevenLabsAccess = Boolean(env.ELEVENLABS_API_KEY);
export const hasOpenAIAccess = Boolean(env.OPENAI_API_KEY);
export const hasTranslationAccess = Boolean(env.GOOGLE_CLOUD_API_KEY);

export { env };