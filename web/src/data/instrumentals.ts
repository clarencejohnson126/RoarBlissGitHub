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
    src: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/audio/instrumentals/cinematic-oath-ogc1c0fvvxklbhYsyuk5Lw2G037bom.mp3",
    intensity: "epic",
    recommendedFor: ["Fatherhood", "Business Comeback", "Discipline"],
  },
  {
    id: "oath-of-stone",
    title: "Oath of Stone",
    mood: "Epic · ceremonial · unbreakable",
    category: "Epic",
    src: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/audio/instrumentals/oath-of-stone-2BPnSiwLAwNmuZJ2J6iHp1nzEaZGZs.mp3",
    intensity: "epic",
    recommendedFor: ["Discipline", "Business Comeback", "Warrior"],
  },
  {
    id: "gravity-of-hope",
    title: "Gravity of Hope",
    mood: "Emotional · cosmic · reflective",
    category: "Hopeful",
    src: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/audio/instrumentals/gravity-of-hope-47Z5syFbWB9mXPmpWQu2HA4Jms7GtF.mp3",
    intensity: "medium",
    recommendedFor: ["Grief", "Rebirth", "Heartbreak"],
  },
  {
    id: "iron-morning",
    title: "Iron Morning",
    mood: "Disciplined · focused · grounded",
    category: "Discipline",
    src: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/audio/instrumentals/iron-morning-jAUjgrFv9R7xxPr8av43IygBVbmnH8.mp3",
    intensity: "high",
    recommendedFor: ["Gym", "Routine", "Self-mastery"],
  },
  {
    id: "after-the-storm",
    title: "After the Storm",
    mood: "Hopeful · warm · rebuilding",
    category: "Hopeful",
    src: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/audio/instrumentals/after-the-storm-wX3NXdld7Ib8W87OqaaSCBsgKOcf1v.mp3",
    intensity: "medium",
    recommendedFor: ["Heartbreak", "Loss", "New chapter"],
  },
  {
    id: "the-quiet-war",
    title: "The Quiet War",
    mood: "Dark · restrained · intense",
    category: "Dark Season",
    src: "https://5w5yp925pv6eecn7.public.blob.vercel-storage.com/audio/instrumentals/the-quiet-war-QlBAYakC20T5UsfiZvrjBS8RVAjG6q.mp3",
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
