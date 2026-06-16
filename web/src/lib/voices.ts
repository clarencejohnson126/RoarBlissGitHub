// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY VOICES — the single swap-point for the Instrumental / Library-Voice path.
//
// When a user uploads an INSTRUMENTAL (no voice to clone), they pick one of these
// voices; its `referenceUrl` clip becomes the OmniVoice clone reference and the
// voice is laid OVER the original bed (RULE #1: the bed is never ducked/pumped).
//
// ⚠️ LEGAL — INTERNAL TEST ONLY, NOT FOR PUBLIC MARKETING ⚠️
// ─────────────────────────────────────────────────────────────────────────────
// The audio behind `previewUrl` / `referenceUrl` below is DERIVED FROM ELEVENLABS
// SAMPLES. ElevenLabs' Prohibited Use Policy FORBIDS using EL output as a clone
// reference in production. These exist purely to wire + test the path end-to-end.
//
// BEFORE this feature is exposed to real/paying users or any marketing:
//   • Swap every `referenceUrl` (and the matching `previewUrl`) for a legally-clean
//     source — LibriTTS-R (CC-BY-4.0) and/or commissioned voice actors WITH an
//     explicit AI-cloning buyout in the contract.
//   • Keep the same { id } values so saved selections + the cog wiring keep working.
//   • This file is the ONE place to change — nothing else references the raw URLs.
//     (Open to extension, closed to modification: add/replace entries here only.)
//
// Reference-clip spec (so a swapped-in source clones cleanly on OmniVoice):
//   6–10 s, mono, 24 kHz WAV, HPF80 + LPF14k + loudnorm I=-18, NO FFT denoise
//   (afftdn corrupts the reference → OmniVoice clones gibberish — Constitution §4).
// ─────────────────────────────────────────────────────────────────────────────

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
  /** One-line character description shown on the card. */
  tagline: string;
  /** Public URL the user hears when they tap "play" (a short MP3 sample). */
  previewUrl: string;
  /** Public URL of the 6–10 s mono clip used as the OmniVoice clone reference. */
  referenceUrl: string;
}

// Deep MALE voices lead (the founder's priority), then FEMALE — spread across
// american / british / southern / scottish, with cinematic/film options in each.
export const LIBRARY_VOICES: LibraryVoice[] = [
  // ── Male ───────────────────────────────────────────────────────────────────
  {
    id: "atlas",
    name: "Atlas",
    gender: "male",
    accent: "american",
    style: "cinematic",
    tagline: "Deep, resonant, cinematic — the voice that grounds you.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/atlas_preview-mJrVNu99YjTT1tNWbSsTOnPfZHFhTK.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/atlas_reference-h0cEeZm3otqZx1mbxgMlukrzL9FbXj.wav",
  },
  {
    id: "magnus",
    name: "Magnus",
    gender: "male",
    accent: "american",
    style: "standard",
    tagline: "Rich, wise and steady — a mentor in your corner.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/magnus_preview-lmbbZdBXsKyQL2TwVb1h2O3jWeXC7P.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/magnus_reference-ULVHqef8Jl3Wk7OLWw96srUVpdbKI3.wav",
  },
  {
    id: "crown",
    name: "Crown",
    gender: "male",
    accent: "british",
    style: "cinematic",
    tagline: "A commanding British baritone — epic, theatrical, regal.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/crown_preview-zwCXuhBQX0dApMzbR7d5JxSUAGgNKF.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/crown_reference-1UDTaf8W3QWVNM4uJKh0oBK2g5Rp5n.wav",
  },
  {
    id: "ridge",
    name: "Ridge",
    gender: "male",
    accent: "southern",
    style: "standard",
    tagline: "Deep, smooth Southern grit — calm, unhurried, certain.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/ridge_preview-jL45pvOZyat5e9OYLSLsIQd0Ib7s04.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/ridge_reference-3ND6kdni8Orw7s8y451BoHa1TaKF9K.wav",
  },
  {
    id: "stone",
    name: "Stone",
    gender: "male",
    accent: "scottish",
    style: "cinematic",
    tagline: "A classic Scottish storyteller — weathered, mythic, warm.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/stone_preview-T2rpf3C7csOIDh78qdOi1kPbPi7YbM.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/stone_reference-GqpMWnaDHHoI9PGpb7xZVnCDo3ggTb.wav",
  },
  // ── Female ───────────────────────────────────────────────────────────────────
  {
    id: "aria",
    name: "Aria",
    gender: "female",
    accent: "american",
    style: "standard",
    tagline: "Bright, warm and motivating — momentum in a voice.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/aria_preview-4mkPMDaXmViGdeRgond9Xu4wObHsBK.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/aria_reference-uenpV7O9CtT91wKXizAoTxgQ6l3xxb.wav",
  },
  {
    id: "noir",
    name: "Noir",
    gender: "female",
    accent: "british",
    style: "cinematic",
    tagline: "Intense, velvet British delivery — high-end and dramatic.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/noir_preview-uBVvWDzO3MjmdPdIgq0EHxcrKlsaad.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/noir_reference-erNq8HkCKahLjOsnyh5qQFG2buta7e.wav",
  },
  {
    id: "vesper",
    name: "Vesper",
    gender: "female",
    accent: "american",
    style: "standard",
    tagline: "Tough, stern and direct — no excuses, only the next step.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/vesper_preview-8n104GAuR6egXHaA4qAlHVXKMown6E.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/vesper_reference-XcUt24AJSbXA7ckOOkbPcUHjB54aOO.wav",
  },
  {
    id: "dawn",
    name: "Dawn",
    gender: "female",
    accent: "american",
    style: "standard",
    tagline: "Warm Midwest confidence — like a hand on your shoulder.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/dawn_preview-ESoTMhb1Bd43Mm14NaWQEz6ocjqKR8.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/dawn_reference-j94eL4y007HoQoj4S4CVohcsQMqfFJ.wav",
  },
  {
    id: "sage",
    name: "Sage",
    gender: "female",
    accent: "british",
    style: "standard",
    tagline: "Warm, clear British instruction — composed and reassuring.",
    previewUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/sage_preview-unkYPED0DHob3MtsgKClyPtr4HUUL4.mp3",
    referenceUrl: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/voices/library/sage_reference-CYCbciaPWb8bkaaQlh3fzfRvF4f9rt.wav",
  },
];

/** Look up a voice by id (used to resolve the chosen voice's referenceUrl for the cog request). */
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
