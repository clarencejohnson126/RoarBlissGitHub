"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Check } from "lucide-react";
import { LIBRARY_VOICES, ACCENT_LABEL, type LibraryVoice } from "@/lib/voices";
import styles from "./create.module.css";

/**
 * Library-voice picker — shown (and required) when the user says their upload is an INSTRUMENTAL.
 * The chosen voice's clone reference is laid over the original bed by the cog. Cards show name,
 * gender, accent badge, a cinematic tag, and a play button to preview the sample. Matches the
 * existing battle/tone card style (no new design language).
 */
export default function VoicePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [playing, setPlaying] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop any preview when the component unmounts (e.g. navigating to the next step).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePlay = (v: LibraryVoice, e: React.MouseEvent) => {
    e.stopPropagation(); // play must not also select the card
    if (playing === v.id) {
      audioRef.current?.pause();
      setPlaying("");
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(v.previewUrl);
    audioRef.current = a;
    a.onended = () => setPlaying("");
    a.onerror = () => setPlaying("");
    a.play().then(() => setPlaying(v.id)).catch(() => setPlaying(""));
  };

  return (
    <div className={styles.voiceGrid}>
      {LIBRARY_VOICES.map((v) => {
        const on = selectedId === v.id;
        const isPlaying = playing === v.id;
        return (
          <div
            key={v.id}
            className={`${styles.voiceCard} ${on ? styles.voiceCardOn : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            onClick={() => onSelect(v.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(v.id);
              }
            }}
          >
            <button
              type="button"
              className={styles.voicePlay}
              aria-label={isPlaying ? `Pause ${v.name}` : `Play ${v.name}`}
              onClick={(e) => togglePlay(v, e)}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>

            <div className={styles.voiceMeta}>
              <div className={styles.voiceName}>{v.name}</div>
              <div className={styles.voiceTagline}>{v.tagline}</div>
              <div className={styles.voiceBadges}>
                <span className={styles.voiceBadge}>{v.gender === "male" ? "Male" : "Female"}</span>
                <span className={styles.voiceBadge}>{ACCENT_LABEL[v.accent]}</span>
                {v.style === "cinematic" && (
                  <span className={`${styles.voiceBadge} ${styles.voiceBadgeGold}`}>Cinematic</span>
                )}
              </div>
            </div>

            {on && (
              <span className={styles.voiceCheck} aria-hidden>
                <Check size={16} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
