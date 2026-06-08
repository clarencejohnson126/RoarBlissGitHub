// Instrumental sound beds for the /story "Choose Your Sound" chapter + global player.
// Public-facing labels are ORIGINAL (legal-safe) — no copyrighted titles. Drop the matching mp3s
// into web/public/audio/instrumentals/<id>.mp3. Missing files are handled gracefully (no crash).
// Supports up to 50 — just add entries here.

export type Intensity = "low" | "medium" | "high" | "epic";

export interface Instrumental {
  id: string;
  title: string;
  mood: string;
  category: string;
  src: string;
  duration?: string;
  intensity: Intensity;
  recommendedFor: string[];
}

export const INSTRUMENTALS: Instrumental[] = [
  {
    id: "cinematic-oath",
    title: "Cinematic Oath",
    mood: "Epic · solemn · rising",
    category: "Epic",
    src: "/audio/instrumentals/cinematic-oath.mp3",
    intensity: "epic",
    recommendedFor: ["Fatherhood", "Business Comeback", "Discipline"],
  },
  {
    id: "gravity-of-hope",
    title: "Gravity of Hope",
    mood: "Emotional · cosmic · reflective",
    category: "Hopeful",
    src: "/audio/instrumentals/gravity-of-hope.mp3",
    intensity: "medium",
    recommendedFor: ["Grief", "Rebirth", "Heartbreak"],
  },
  {
    id: "iron-morning",
    title: "Iron Morning",
    mood: "Disciplined · focused · grounded",
    category: "Discipline",
    src: "/audio/instrumentals/iron-morning.mp3",
    intensity: "high",
    recommendedFor: ["Gym", "Routine", "Self-mastery"],
  },
  {
    id: "after-the-storm",
    title: "After the Storm",
    mood: "Hopeful · warm · rebuilding",
    category: "Hopeful",
    src: "/audio/instrumentals/after-the-storm.mp3",
    intensity: "medium",
    recommendedFor: ["Heartbreak", "Loss", "New chapter"],
  },
  {
    id: "the-quiet-war",
    title: "The Quiet War",
    mood: "Dark · restrained · intense",
    category: "Dark Season",
    src: "/audio/instrumentals/the-quiet-war.mp3",
    intensity: "high",
    recommendedFor: ["Business Comeback", "Pressure", "Discipline"],
  },
  {
    id: "legacy-fire",
    title: "Legacy Fire",
    mood: "Warm · family · protective",
    category: "Fatherhood",
    src: "/audio/instrumentals/legacy-fire.mp3",
    intensity: "medium",
    recommendedFor: ["Fatherhood", "Family", "Purpose"],
  },
];

export const DEFAULT_INSTRUMENTAL_ID = "cinematic-oath";

export const CATEGORIES = [
  "Epic",
  "Discipline",
  "Grief",
  "Fatherhood",
  "Heartbreak",
  "Business Comeback",
  "Dark Season",
  "Hopeful",
  "Calm",
  "Aggressive",
  "Cinematic",
] as const;

export function getInstrumental(id: string | null | undefined): Instrumental | undefined {
  return INSTRUMENTALS.find((i) => i.id === id);
}
