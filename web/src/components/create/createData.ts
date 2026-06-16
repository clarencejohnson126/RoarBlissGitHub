// Data + types for the cinematic /create onboarding wizard.
// Inclusive copy (men + women). All collected fields fold into the existing /api/process payload.

import { getVoiceById } from "@/lib/voices";

export type Intensity = "low" | "medium" | "high";
export type Depth = 25 | 50 | 75 | 100;
/** Does the uploaded file already carry a voice (personalize it) or is it an instrumental (pick a
 *  library voice)? This is the GUARANTEE behind the instrumental/library-voice path — the user's
 *  explicit choice, never auto-detection alone. */
export type SourceMode = "voice" | "instrumental";

export interface CreateFlowData {
  userName: string;
  selectedBattles: string[];
  neededEmotions: string[];
  lifePressure: string[];
  reasonForFighting: string[];
  reminderText: string;
  primaryTone: string;
  secondaryTone: string;
  intensity: Intensity;
  personalizationDepth: Depth;
  language: string;
  mainGoal: string;
  deadline: string;
  wordsToInclude: string;
  wordsToAvoid: string;
  customPrompt: string;
  /** "voice" = the upload has a voice to personalize (default). "instrumental" = no voice → the user
   *  picks a library voice to lay over the bed. */
  sourceMode: SourceMode;
  /** The chosen library-voice id (see web/src/lib/voices.ts). Required when sourceMode === "instrumental". */
  libraryVoiceId: string;
}

export const EMPTY_FLOW: CreateFlowData = {
  userName: "",
  selectedBattles: [],
  neededEmotions: [],
  lifePressure: [],
  reasonForFighting: [],
  reminderText: "",
  primaryTone: "",
  secondaryTone: "",
  intensity: "medium",
  personalizationDepth: 75,
  language: "English",
  mainGoal: "",
  deadline: "",
  wordsToInclude: "",
  wordsToAvoid: "",
  customPrompt: "",
  sourceMode: "voice",
  libraryVoiceId: "",
};

// Step 2 — battle templates (each maps to an emotional context the planner uses)
export const BATTLES: { title: string; desc: string; icon: string; image: string }[] = [
  { title: "Discipline", desc: "For the days when nobody is watching.", icon: "🜂", image: "warrior-prayer" },
  { title: "Business Comeback", desc: "For rebuilding when pressure is on your chest.", icon: "⚔", image: "planning-table" },
  { title: "Fatherhood / Motherhood", desc: "For the people who need you strong.", icon: "🛡", image: "father-daughter" },
  { title: "Heartbreak", desc: "For rising from what broke you.", icon: "🜔", image: "closeup-warrior" },
  { title: "Grief / Loss", desc: "For carrying pain without letting it bury you.", icon: "🕯", image: "empty-hall" },
  { title: "Muscle Gain / Fitness", desc: "For the last set and the new record.", icon: "🜃", image: "warrior-prayer" },
  { title: "Confidence", desc: "For walking in as the person who already decided.", icon: "✦", image: "closeup-warrior" },
  { title: "Dark Season", desc: "For the heaviest days — the voice that keeps you standing.", icon: "🌒", image: "empty-hall" },
  { title: "New Beginning", desc: "For starting over with everything you've learned.", icon: "☼", image: "mountain-family" },
  { title: "Anger Into Focus", desc: "For turning the fire into something that builds.", icon: "🜉", image: "warrior-prayer" },
  { title: "Financial Pressure", desc: "For the one who needs to survive, rebuild and rise.", icon: "⚖", image: "planning-table" },
  { title: "Prove Them Wrong", desc: "For the quiet fire you do not say out loud.", icon: "🔥", image: "closeup-warrior" },
];

// Step 3 — current state chips
export const NEEDED_EMOTIONS = ["Discipline", "Calmness", "Fire", "Courage", "Forgiveness", "Focus", "Hope", "Strength", "Self-respect", "A hard wake-up call"];
export const LIFE_PRESSURE = ["Money", "Work", "Family", "Relationship", "Health", "Loss", "Self-doubt", "Procrastination", "Fear of failure", "Starting over"];
export const REASONS = ["Myself", "My children", "My partner", "My parents", "My family", "My future self", "Someone I lost", "People who doubted me"];

// Step 4 — tone cards
export const TONES: { title: string; desc: string }[] = [
  { title: "Calm & Stoic", desc: "Steady. Grounded. Unshakeable." },
  { title: "Dark & Intense", desc: "Low, heavy, no excuses." },
  { title: "Warm & Hopeful", desc: "A hand on your shoulder." },
  { title: "Aggressive Discipline", desc: "Get up. Move. Now." },
  { title: "Fatherly / Protective", desc: "For the ones who watch you." },
  { title: "Spiritual / Reflective", desc: "Quiet truth, deeper meaning." },
  { title: "Warrior Mode", desc: "Battle-ready, full force." },
  { title: "Comeback Energy", desc: "Down, not done. Rising." },
];

// LAUNCH (2026-06-15): English-only. Cross-lingual translation produces garbled output on the cloud
// (CUDA) — OmniVoice cross-lingual is clean on local MPS but garbles on every cloud config tested
// (torch 2.5.1/2.6, fp16/bf16/fp32, num_step 80/48). Restore the full list once translation works in
// prod (v2 path: native-voice translation). Single-element list = no language picker reaches users.
export const LANGUAGES = ["English"];
// export const LANGUAGES = ["English", "German", "Spanish", "French", "Italian", "Portuguese", "Dutch", "Polish", "Chinese"];

export const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: 25, label: "25%", hint: "Light personalization" },
  { value: 50, label: "50%", hint: "Balanced transformation" },
  { value: 75, label: "75%", hint: "Deeply personal" },
  { value: 100, label: "Full", hint: "Complete battle speech" },
];

// internal opaque tone keys the cog/player depend on — never shown to users
const FIRE_TONES = new Set(["Dark & Intense", "Aggressive Discipline", "Warrior Mode", "Comeback Energy"]);
// Tones the user explicitly picked as quiet/grounded. An explicit calm tone OWNS the energy read —
// a lingering intensity:"high" (e.g. pre-filled from an old saved profile on Quick Create) must not
// flip a "Calm & Stoic" take into the aggressive crimson theme. The chosen TONE is the truth signal.
const CALM_TONES = new Set(["Calm & Stoic", "Warm & Hopeful", "Spiritual / Reflective", "Fatherly / Protective"]);
/** Truthful visual-energy flag derived from the user's REAL tone/intensity (drives the player's
 *  crimson-vs-gold theme). NOT a voice/celebrity attribution — the player must never claim a named voice.
 *  Tone wins over intensity: a named fire tone is always high, a named calm tone is always calm, and
 *  intensity only decides when no explicit tone was chosen. */
export function isHighEnergy(primaryTone: string, intensity: Intensity): boolean {
  if (FIRE_TONES.has(primaryTone)) return true;
  if (CALM_TONES.has(primaryTone)) return false;
  return intensity === "high";
}
export function deriveChampion(primaryTone: string, intensity: Intensity): "Eric Thomas" | "Les Brown" {
  return isHighEnergy(primaryTone, intensity) ? "Eric Thomas" : "Les Brown";
}

/** Compose the rich wizard data into the existing /api/process payload (no backend change). */
export function composePayload(d: CreateFlowData) {
  const parts: string[] = [];
  // PRECEDENCE (founder rule): the per-speech free-text is THE brief and must dominate. The cog
  // (predict.py: `ctx = prompt.strip() if prompt else _context_prompt(...)`) ignores the structured
  // family/battlefield fields entirely whenever `prompt` is non-empty and parses THIS string instead —
  // so a fresh request must LEAD, never sit behind saved/background lines. (This is the root of the
  // "I typed demons/entrepreneur but got a speech about my mom & kids" bug: the saved reasonForFighting
  // was injected ahead of the fresh prompt and the planner weighted it.)
  if (d.customPrompt.trim()) parts.push(`What this speech is about (most important): ${d.customPrompt.trim()}`);
  if (d.selectedBattles.length) parts.push(`Battles: ${d.selectedBattles.join(", ")}.`);
  if (d.neededEmotions.length) parts.push(`Needs most right now: ${d.neededEmotions.join(", ")}.`);
  if (d.lifePressure.length) parts.push(`Main pressure: ${d.lifePressure.join(", ")}.`);
  if (d.reasonForFighting.length) parts.push(`Fighting for: ${d.reasonForFighting.join(", ")}.`);
  if (d.reminderText.trim()) parts.push(`Should remind me: ${d.reminderText.trim()}`);
  if (d.mainGoal.trim()) parts.push(`Main goal: ${d.mainGoal.trim()}.`);
  if (d.deadline.trim()) parts.push(`Time pressure: ${d.deadline.trim()}.`);
  if (d.wordsToInclude.trim()) parts.push(`Include these words/names: ${d.wordsToInclude.trim()}.`);
  if (d.wordsToAvoid.trim()) parts.push(`Avoid these words: ${d.wordsToAvoid.trim()}.`);
  parts.push(`Delivery intensity: ${d.intensity}.`);

  // Instrumental / library-voice path: the upload has NO voice to clone, so the user picked a library
  // voice. We send its clone-reference URL + clone_source_voices=false so the cog lays THAT voice over
  // the original bed (RULE #1: bed untouched) instead of trying to diarize a non-existent speaker. A
  // chosen library voice forces the full (100%) script — there is no original speech to keep.
  const lib = d.sourceMode === "instrumental" ? getVoiceById(d.libraryVoiceId) : undefined;

  return {
    name: d.userName.trim() || "Warrior",
    battlefield: d.selectedBattles.join(", "),
    family: d.reasonForFighting.join(", "),
    struggle: [d.lifePressure.join(", "), d.reminderText.trim()].filter(Boolean).join(" — "),
    location: "",
    champion: deriveChampion(d.primaryTone, d.intensity),
    tone: [d.primaryTone, d.secondaryTone].filter(Boolean).join(" + "),
    // An instrumental + chosen voice has nothing to keep → speak the whole bed (full_voice). Otherwise
    // honor the user's tier exactly.
    personalization: lib ? (100 as Depth) : d.personalizationDepth,
    language: d.language || "English",
    prompt: parts.join(" "),
    paid: false,
    // Library-voice-over-bed wiring (only set when an instrumental voice was actually chosen).
    ...(lib
      ? { voiceReferenceUrl: lib.referenceUrl, libraryVoiceId: lib.id, cloneSourceVoices: false }
      : {}),
  };
}
