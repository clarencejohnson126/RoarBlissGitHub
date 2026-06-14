"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_INSTRUMENTAL_ID, getInstrumental } from "@/data/instrumentals";
import AudioUnlockOverlay from "./AudioUnlockOverlay";
import GlobalAudioPlayer from "./GlobalAudioPlayer";

const TARGET_VOLUME = 0.35;
const STORAGE_KEY = "roarbliss_selected_instrumental";

type AudioCtx = {
  unlocked: boolean;
  playing: boolean;
  muted: boolean;
  volume: number;
  selectedId: string; // the track chosen "for your speech"
  currentId: string; // the track currently loaded in the player
  trackError: boolean;
  progress: number; // 0..1 playback position of the current track
  unlock: (withSound: boolean) => void;
  playTrack: (id: string) => void; // preview / play a track
  selectTrack: (id: string) => void; // choose for speech + play
  togglePlay: () => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  seek: (fraction: number) => void; // jump to 0..1 of the current track
};

const Ctx = createContext<AudioCtx | null>(null);

export function useAudio(): AudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio must be used within CinematicAudioProvider");
  return ctx;
}

export default function CinematicAudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRaf = useRef(0);

  const [unlocked, setUnlocked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVol] = useState(TARGET_VOLUME);
  const [selectedId, setSelectedId] = useState(DEFAULT_INSTRUMENTAL_ID);
  const [currentId, setCurrentId] = useState(DEFAULT_INSTRUMENTAL_ID);
  const [trackError, setTrackError] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 — the player's seek bar starts at the far left

  // restore the saved choice
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && getInstrumental(saved)) {
        setSelectedId(saved);
        setCurrentId(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const cancelFade = () => {
    if (fadeRaf.current) cancelAnimationFrame(fadeRaf.current);
    fadeRaf.current = 0;
  };

  const fadeTo = useCallback((target: number, ms: number, onDone?: () => void) => {
    const el = audioRef.current;
    if (!el) return;
    cancelFade();
    const from = el.volume;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      // clamp — float math can drift a hair below 0 / above 1, which throws on el.volume
      el.volume = Math.max(0, Math.min(1, from + (target - from) * p));
      if (p < 1) fadeRaf.current = requestAnimationFrame(step);
      else {
        fadeRaf.current = 0;
        onDone?.();
      }
    };
    fadeRaf.current = requestAnimationFrame(step);
  }, []);

  const loadAndPlay = useCallback(
    // isMuted is passed explicitly so we never read a stale `muted` from the closure
    (id: string, fadeIn: boolean, isMuted: boolean) => {
      const el = audioRef.current;
      const track = getInstrumental(id);
      if (!el || !track) return;
      setTrackError(false);
      setCurrentId(id);
      setProgress(0); // a freshly loaded track starts at the beginning (slider far left)
      el.src = track.src;
      el.load();
      el.muted = isMuted;
      el.volume = fadeIn && !isMuted ? 0 : volume;
      el.play()
        .then(() => {
          setPlaying(true);
          if (fadeIn && !isMuted) fadeTo(volume, 1500);
          else el.volume = volume;
        })
        .catch(() => setPlaying(false)); // autoplay blocked or file missing — stay graceful
    },
    [volume, fadeTo],
  );

  const onError = () => {
    setTrackError(true);
    setPlaying(false);
  };

  const unlock = useCallback(
    (withSound: boolean) => {
      setUnlocked(true);
      const el = audioRef.current;
      if (!el) return;
      if (withSound) {
        setMuted(false);
        loadAndPlay(currentId, true, false);
      } else {
        setMuted(true);
        loadAndPlay(currentId, false, true); // plays MUTED (silent); unmute later = instant sound
      }
    },
    [currentId, loadAndPlay],
  );

  const playTrack = useCallback(
    (id: string) => {
      const el = audioRef.current;
      if (!el) return;
      if (id === currentId) {
        if (playing) return;
        el.play()
          .then(() => {
            setPlaying(true);
            fadeTo(muted ? 0 : volume, 600);
          })
          .catch(() => setTrackError(true));
        return;
      }
      // switch tracks: fade out → swap → play → fade in (honor current muted state)
      fadeTo(0, 350, () => loadAndPlay(id, true, muted));
    },
    [currentId, playing, muted, volume, fadeTo, loadAndPlay],
  );

  const selectTrack = useCallback(
    (id: string) => {
      setSelectedId(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      playTrack(id);
    },
    [playTrack],
  );

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setTrackError(true));
    }
  }, [playing]);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const next = !muted;
    setMuted(next);
    el.muted = next;
  }, [muted]);

  const setVolume = useCallback((v: number) => {
    setVol(v);
    const el = audioRef.current;
    if (el && !fadeRaf.current && !el.muted) el.volume = v;
  }, []);

  const seek = useCallback((fraction: number) => {
    const el = audioRef.current;
    if (!el || !el.duration || !isFinite(el.duration)) return;
    const f = Math.max(0, Math.min(1, fraction));
    el.currentTime = f * el.duration;
    setProgress(f);
  }, []);

  // keep the seek bar in sync with playback (fires ~4x/s while playing)
  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || !el.duration || !isFinite(el.duration)) return;
    setProgress(el.currentTime / el.duration);
  }, []);

  useEffect(() => () => cancelFade(), []);

  return (
    <Ctx.Provider
      value={{ unlocked, playing, muted, volume, selectedId, currentId, trackError, progress, unlock, playTrack, selectTrack, togglePlay, toggleMute, setVolume, seek }}
    >
      {/* single audio element for the whole experience */}
      <audio ref={audioRef} loop preload="auto" onError={onError} onTimeUpdate={onTimeUpdate} />
      {children}
      {unlocked && <GlobalAudioPlayer />}
      <AudioUnlockOverlay />
    </Ctx.Provider>
  );
}
