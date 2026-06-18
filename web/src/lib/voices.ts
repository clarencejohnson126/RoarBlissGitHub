/**
 * Library voices — the single swap-point for the instrumental + translation paths.
 * The 10 personas keep their names/taglines; each is now backed by an ElevenLabs voice_id (the
 * instrumental/translation engine per the differentiated-engine plan). `el_voice_id` is a PLACEHOLDER
 * mapping (2026-06-17) — the founder curates the real voices in the EL Voice Library; swapping one is a
 * single DB/array edit, no rebuild. `previewUrl` is the static EL CDN sample (0-cost audition). The
 * legacy `referenceUrl` (OmniVoice clone clip) is kept as a fallback but unused on the EL path.
 */
export type VoiceGender = "male" | "female";
export type VoiceAccent = "american" | "british" | "southern" | "scottish";
export type VoiceStyle = "standard" | "cinematic";

export interface LibraryVoice {
  /** Stable opaque id — flows into the saved selection + the cog request. NEVER reuse/rename. */
  id: string;
  /** User-facing display name (a persona name, NOT the original EL voice name). */
  name: string;
  gender: VoiceGender;
  accent: VoiceAccent;
  style: VoiceStyle;
  /** BCP-ish language tag of the voice (en, de, pt-BR, fr, es, it, tr, zh). */
  language: string;
  /** The ElevenLabs voice_id spoken at TTS time (instrumental + translation engine). */
  el_voice_id: string;
  /** One-line character description shown on the card. */
  tagline: string;
  /** Public URL the user hears on "play" — the static EL CDN sample (0-cost audition). */
  previewUrl: string;
  /** Legacy: public URL of the OmniVoice clone reference clip. Unused on the EL path. */
  referenceUrl?: string;
}

export const LIBRARY_VOICES: LibraryVoice[] = [
  {
    id: "atlas",
    name: "Atlas",
    gender: "male",
    accent: "american",
    style: "cinematic",
    language: "en",
    el_voice_id: "GOfBfv0luIdTaaO7RdJh",
    tagline: "Deep, resonant, cinematic — the voice that grounds you.",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/b377842a3aee4de989b584d770ec9d76/voices/GOfBfv0luIdTaaO7RdJh/13aaf010-bb59-421d-8f2d-a15b5800edf6.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/atlas_reference-h0cEeZm3otqZx1mbxgMlukrzL9FbXj.wav",
  },
  {
    id: "magnus",
    name: "Magnus",
    gender: "male",
    accent: "american",
    style: "standard",
    language: "en",
    el_voice_id: "8BNZXqdnYLBqxWWAuQYn",
    tagline: "Rich, wise and steady — a mentor in your corner.",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/20064080b53d4ed3abb129b750e8be15/voices/8BNZXqdnYLBqxWWAuQYn/KIz0IU8g1QXQJ2tLk7ET.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/magnus_reference-ULVHqef8Jl3Wk7OLWw96srUVpdbKI3.wav",
  },
  {
    id: "crown",
    name: "Crown",
    gender: "male",
    accent: "british",
    style: "cinematic",
    language: "en",
    el_voice_id: "JWlKsAOcyfylxVyKfOQW",
    tagline: "A commanding British baritone — epic, theatrical, regal.",
    previewUrl: "https://api.us.elevenlabs.io/v1/voices/JWlKsAOcyfylxVyKfOQW/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiIwMzY5ZGZkZWUxOWY0YWFlYjNlMGZlZDYyNjNjMWYxZSIsImZpbGVuYW1lIjoiMk9OcFI0OEdweXJKT3VZNG1vMTMubXAzIiwidGltZXN0YW1wIjoxNzgxNzMwMDAwMDAwMDAwfQ%3D%3D",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/crown_reference-1UDTaf8W3QWVNM4uJKh0oBK2g5Rp5n.wav",
  },
  {
    id: "ridge",
    name: "Ridge",
    gender: "male",
    accent: "southern",
    style: "standard",
    language: "en",
    el_voice_id: "SEOpGCKN7er9UhGUUgDR",
    tagline: "Deep, smooth Southern grit — calm, unhurried, certain.",
    previewUrl: "https://api.us.elevenlabs.io/v1/voices/SEOpGCKN7er9UhGUUgDR/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiIwMWE2ZmRiOWNiZWI0M2FmOTE4ODk2ZWUzZWViMWYwNyIsImZpbGVuYW1lIjoiU0d2S3hqbDhhWEVxNUpyd3ZtZEUubXAzIiwidGltZXN0YW1wIjoxNzgxNzMwMDAwMDAwMDAwfQ%3D%3D",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/ridge_reference-3ND6kdni8Orw7s8y451BoHa1TaKF9K.wav",
  },
  {
    id: "stone",
    name: "Stone",
    gender: "male",
    accent: "scottish",
    style: "cinematic",
    language: "en",
    el_voice_id: "7IcEoybCSRDZ0tsNBX6Y",
    tagline: "A classic Scottish storyteller — weathered, mythic, warm.",
    previewUrl: "https://api.us.elevenlabs.io/v1/voices/7IcEoybCSRDZ0tsNBX6Y/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiJmOWMzNzIzYzM1NTQ0M2EzOWVlMWNlZDJmNTFjYTY4ZiIsImZpbGVuYW1lIjoieklWWUVVYkhYYWczdVY5bXowanMubXAzIiwidGltZXN0YW1wIjoxNzgxNzMwMDAwMDAwMDAwfQ%3D%3D",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/stone_reference-GqpMWnaDHHoI9PGpb7xZVnCDo3ggTb.wav",
  },
  {
    id: "aria",
    name: "Aria",
    gender: "female",
    accent: "american",
    style: "standard",
    language: "en",
    el_voice_id: "tSFrmifcoKA2lXImR5MW",
    tagline: "Bright, warm and motivating — momentum in a voice.",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/6b677d3ad2b342009a3bc3d428cebfc3/voices/tSFrmifcoKA2lXImR5MW/RpgPIEt1sX2fm1NI0u1F.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/aria_reference-uenpV7O9CtT91wKXizAoTxgQ6l3xxb.wav",
  },
  {
    id: "noir",
    name: "Noir",
    gender: "female",
    accent: "british",
    style: "cinematic",
    language: "en",
    el_voice_id: "49S3tHf0uTVzQN5pADIu",
    tagline: "Intense, velvet British delivery — high-end and dramatic.",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/f0e1d78d04c544bda0c83167c8630a02/voices/49S3tHf0uTVzQN5pADIu/822d790c-c8ae-47ee-a9f3-df3b5ed89ebd.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/noir_reference-erNq8HkCKahLjOsnyh5qQFG2buta7e.wav",
  },
  {
    id: "vesper",
    name: "Vesper",
    gender: "female",
    accent: "american",
    style: "standard",
    language: "en",
    el_voice_id: "5i6nb2OuGBhcSFuXLsnR",
    tagline: "Tough, stern and direct — no excuses, only the next step.",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/b887fe235abf4913bbe48844f3338e5c/voices/5i6nb2OuGBhcSFuXLsnR/2emQaGmCF4hu1qyklK3s.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/vesper_reference-XcUt24AJSbXA7ckOOkbPcUHjB54aOO.wav",
  },
  {
    id: "dawn",
    name: "Dawn",
    gender: "female",
    accent: "american",
    style: "standard",
    language: "en",
    el_voice_id: "Jkr7fpJ2L0EgonJBZKRn",
    tagline: "Warm Midwest confidence — like a hand on your shoulder.",
    previewUrl: "https://api.us.elevenlabs.io/v1/voices/Jkr7fpJ2L0EgonJBZKRn/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiI3MzQwNGU1MjMyNTQ0YmMyYWFhNDkyZTNhZGIyZTA0ZCIsImZpbGVuYW1lIjoibGJ5MXVOVWdzc2FNS21RODdNcEUubXAzIiwidGltZXN0YW1wIjoxNzgxNzMwMDAwMDAwMDAwfQ%3D%3D",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/dawn_reference-j94eL4y007HoQoj4S4CVohcsQMqfFJ.wav",
  },
  {
    id: "sage",
    name: "Sage",
    gender: "female",
    accent: "british",
    style: "standard",
    language: "en",
    el_voice_id: "lVpo6IOLjDX4LxkYRZyj",
    tagline: "Warm, clear British instruction — composed and reassuring.",
    previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/9ef82927ee58462fa9429ef93abe605d/voices/lVpo6IOLjDX4LxkYRZyj/zG2ffkeUUTVPvZwhhr2o.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/sage_reference-CYCbciaPWb8bkaaQlh3fzfRvF4f9rt.wav",
  },
];

/** Look up a voice by id (resolves the chosen voice's el_voice_id for the cog request). */
export function getVoiceById(id: string | undefined | null): LibraryVoice | undefined {
  if (!id) return undefined;
  return LIBRARY_VOICES.find((v) => v.id === id);
}

/** Human-readable accent label for badges. */
export const ACCENT_LABEL: Record<VoiceAccent, string> = {
  american: "American",
  british: "British",
  southern: "Southern",
  scottish: "Scottish",
};
