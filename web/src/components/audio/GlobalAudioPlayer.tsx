"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import type Lenis from "lenis";
import { useAudio } from "./CinematicAudioProvider";
import { getInstrumental } from "@/data/instrumentals";
import styles from "./audio.module.css";

/** Fixed premium mini-player, bottom-right (clear of the centered CTAs). Persists across routes. */
export default function GlobalAudioPlayer() {
  const { playing, muted, volume, currentId, trackError, togglePlay, toggleMute, setVolume } = useAudio();
  const track = getInstrumental(currentId);
  const router = useRouter();

  const changeSound = () => {
    const el = document.querySelector("#chapter-sound");
    if (el) {
      const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
      if (lenis) lenis.scrollTo(el as HTMLElement, { offset: -20 });
      else el.scrollIntoView({ behavior: "smooth" });
    } else {
      // not on the story page (e.g. in /create) → go choose a sound there
      router.push("/story#chapter-sound");
    }
  };

  return (
    <div className={styles.player} role="region" aria-label="Background music player">
      <div className={styles.playerTop}>
        <button className={styles.playBtn} onClick={togglePlay} aria-label={playing ? "Pause music" : "Play music"}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <div className={styles.meta}>
          <div className={styles.metaLabel}>Now playing</div>
          <div className={styles.metaTitle}>{track ? track.title : "—"}</div>
        </div>
        <div className={`${styles.bars} ${playing && !muted ? styles.barsPlaying : ""}`} aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={styles.bar} style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <button className={styles.iconBtn} onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      <div className={styles.playerBottom}>
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          aria-label="Volume"
        />
        <button className={styles.changeBtn} onClick={changeSound}>
          Change Sound
        </button>
      </div>

      {trackError && (
        <p className={styles.playerError}>No instrumental loaded yet — drop an .mp3 into /audio/instrumentals.</p>
      )}
    </div>
  );
}
