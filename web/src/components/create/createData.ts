// Data + types for the cinematic /create onboarding wizard.
// Inclusive copy (men + women). All collected fields fold into the existing /api/process payload.

export type Intensity = "low" | "medium" | "high";
export type Depth = 25 | 50 | 75 | 100;

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

export const LANGUAGES = ["English", "German", "Spanish", "French", "Italian", "Portuguese", "Dutch", "Polish"];

export const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: 25, label: "25%", hint: "Light personalization" },
  { value: 50, label: "50%", hint: "Balanced transformation" },
  { value: 75, label: "75%", hint: "Deeply personal" },
  { value: 100, label: "Full", hint: "Complete battle speech" },
];

// internal opaque tone keys the cog/player depend on — never shown to users
const FIRE_TONES = new Set(["Dark & Intense", "Aggressive Discipline", "Warrior Mode", "Comeback Energy"]);
export function deriveChampion(primaryTone: string, intensity: Intensity): "Eric Thomas" | "Les Brown" {
  if (intensity === "high") return "Eric Thomas";
  return FIRE_TONES.has(primaryTone) ? "Eric Thomas" : "Les Brown";
}

/** Compose the rich wizard data into the existing /api/process payload (no backend change). */
export function composePayload(d: CreateFlowData) {
  const parts: string[] = [];
  if (d.selectedBattles.length) parts.push(`Battles: ${d.selectedBattles.join(", ")}.`);
  if (d.neededEmotions.length) parts.push(`Needs most right now: ${d.neededEmotions.join(", ")}.`);
  if (d.lifePressure.length) parts.push(`Main pressure: ${d.lifePressure.join(", ")}.`);
  if (d.reasonForFighting.length) parts.push(`Fighting for: ${d.reasonForFighting.join(", ")}.`);
  if (d.reminderText.trim()) parts.push(`Should remind me: ${d.reminderText.trim()}`);
  if (d.mainGoal.trim()) parts.push(`Main goal: ${d.mainGoal.trim()}.`);
  if (d.deadline.trim()) parts.push(`Time pressure: ${d.deadline.trim()}.`);
  if (d.wordsToInclude.trim()) parts.push(`Include these words/names: ${d.wordsToInclude.trim()}.`);
  if (d.wordsToAvoid.trim()) parts.push(`Avoid these words: ${d.wordsToAvoid.trim()}.`);
  if (d.customPrompt.trim()) parts.push(d.customPrompt.trim());
  parts.push(`Delivery intensity: ${d.intensity}.`);

  return {
    name: d.userName.trim() || "Warrior",
    battlefield: d.selectedBattles.join(", "),
    family: d.reasonForFighting.join(", "),
    struggle: [d.lifePressure.join(", "), d.reminderText.trim()].filter(Boolean).join(" — "),
    location: "",
    champion: deriveChampion(d.primaryTone, d.intensity),
    tone: [d.primaryTone, d.secondaryTone].filter(Boolean).join(" + "),
    personalization: d.personalizationDepth,
    language: d.language || "English",
    prompt: parts.join(" "),
    paid: false,
  };
}
