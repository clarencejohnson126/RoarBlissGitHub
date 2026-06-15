"use client";

import React, { useRef, useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface AudioVisualizerProps {
  /** The user's name — used in the title + download filename. */
  name: string;
  /** Finished prediction id — its audio streams from /api/audio and its share page is /t/<id>. */
  sessionId: string;
  /** VISUAL theme only (crimson vs gold), derived from the user's real tone/intensity. NOT a voice
   *  or celebrity claim — the player must never assert a named/cloned voice it can't verify. */
  highEnergy?: boolean;
}

export default function AudioVisualizer({ name, sessionId, highEnergy = false }: AudioVisualizerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Download is gated behind login: free users HEAR the full (server-capped) track, but keeping the
  // file needs an account. The gate only ever appears for a logged-OUT visitor who taps Download.
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [downloadState, setDownloadState] = useState<"idle" | "working" | "error">("idle");

  // Web Audio nodes (refs to prevent re-connections)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceConnectedRef = useRef(false);

  const themeColor = highEnergy ? "#e63946" : "#ffd700"; // Crimson vs Gold
  const accentColor = highEnergy ? "#ff8a93" : "#fff8c4";

  // Handle Play/Pause
  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Initialize Web Audio on first user interaction
      try {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            audioCtxRef.current = new AudioContextClass();
          }
        }

        if (!audioCtxRef.current) return;

        if (audioCtxRef.current.state === "suspended") {
          await audioCtxRef.current.resume();
        }

        // Connect source only once to avoid browser errors
        if (!sourceConnectedRef.current && audioRef.current) {
          analyserRef.current = audioCtxRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;

          try {
            const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
            source.connect(analyserRef.current);
            analyserRef.current.connect(audioCtxRef.current.destination);
            sourceConnectedRef.current = true;
          } catch (e) {
            console.warn("Could not connect audio source natively, using simulated visualizer loop", e);
          }
        }
      } catch (err) {
        console.error("Web Audio initialization failed", err);
      }

      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Timeline progress — the full track plays through (the free track is already length-capped server-side).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Download flow: needs a logged-in user. Fetch the file with the access token (so /api/audio's
  // download gate passes), then save the blob locally. Not logged in -> open the registration gate.
  const handleDownload = async () => {
    setDownloadState("working");
    try {
      const { data } = await supabaseBrowser().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setDownloadState("idle");
        setShowAuthGate(true);
        return;
      }
      const res = await fetch(`/api/audio?id=${sessionId}&download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setDownloadState("idle");
        setShowAuthGate(true);
        return;
      }
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `roar-bliss-${name || "track"}.mp3`.replace(/\s+/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      setDownloadState("idle");
    } catch (e) {
      console.error("download error", e);
      setDownloadState("error");
    }
  };

  // Send the magic link for registration / sign-in (Supabase OTP).
  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.includes("@")) return;
    setAuthMsg("Sending…");
    // Use the Resend-backed endpoint — Supabase's built-in SMTP is unconfigured and 500s on
    // signInWithOtp ("Error sending magic link email"). /api/auth/magic-link generates the link
    // via the admin API and delivers it through Resend.
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail,
          redirectTo: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      setAuthMsg(res.ok ? "Check your email — open the link, then hit Download again." : j.error || "Could not send the link.");
    } catch {
      setAuthMsg("Could not send the link. Please try again.");
    }
  };

  // Auto-close the gate once the user is authenticated (e.g. returns from the magic link).
  useEffect(() => {
    const { data: sub } = supabaseBrowser().auth.onAuthStateChange((_e, session) => {
      if (session) setShowAuthGate(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Format Time Helper
  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // Canvas Particle Visualizer Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set high-DPI canvas resolution
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Initializing particle system
    const particleCount = 45;
    const particles: Array<{
      x: number;
      y: number;
      radius: number;
      angle: number;
      speed: number;
      alpha: number;
      color: string;
    }> = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight / 2,
        radius: Math.random() * 2 + 1,
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.7 + 0.3,
        color: Math.random() > 0.6 ? accentColor : themeColor,
      });
    }

    let simulatedPhase = 0;

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      // Extract frequency data or fall back to simulation
      let volume = 0;
      const dataArray = analyserRef.current
        ? new Uint8Array(analyserRef.current.frequencyBinCount)
        : null;

      if (analyserRef.current && isPlaying && dataArray) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length;
      } else if (isPlaying) {
        simulatedPhase += 0.08;
        volume = 30 + Math.sin(simulatedPhase) * 15 + Math.cos(simulatedPhase * 0.4) * 8;
      } else {
        simulatedPhase += 0.015;
        volume = 10 + Math.sin(simulatedPhase) * 4;
      }

      // Draw Glowing Background Aura
      const centerX = width / 2;
      const centerY = height / 2;

      const radialGlow = ctx.createRadialGradient(
        centerX, centerY, 5,
        centerX, centerY, 50 + volume * 0.8
      );

      const activeColorHex = isPlaying
        ? themeColor
        : "#3b82f6"; // pause space blue

      radialGlow.addColorStop(0, `${activeColorHex}25`);
      radialGlow.addColorStop(0.5, `${activeColorHex}08`);
      radialGlow.addColorStop(1, "transparent");

      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, width, height);

      // Draw central pulsating orb core
      ctx.beginPath();
      ctx.arc(centerX, centerY, 15 + volume * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = activeColorHex;
      ctx.shadowBlur = 15 + volume * 0.35;
      ctx.shadowColor = activeColorHex;
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      // Draw Orbiting Particles
      particles.forEach((p) => {
        p.x += Math.cos(p.angle) * p.speed * (1 + volume * 0.05);
        p.y += Math.sin(p.angle) * p.speed * (1 + volume * 0.05);

        if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
          p.x = centerX;
          p.y = centerY;
          p.angle = Math.random() * Math.PI * 2;
          p.speed = Math.random() * 1.5 + 0.5;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1 + volume * 0.02), 0, Math.PI * 2);
        ctx.fillStyle = isPlaying ? p.color : "#60a5fa";
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });

      // Draw frequency EQ waves along the bottom
      const barCount = 30;
      const barWidth = width / barCount;
      for (let i = 0; i < barCount; i++) {
        const simHeight = isPlaying
          ? 5 + Math.sin(i * 0.4 + simulatedPhase) * 15 + Math.cos(i * 0.1) * 8
          : 2 + Math.sin(i * 0.2 + simulatedPhase) * 4;

        ctx.fillStyle = activeColorHex;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(i * barWidth, height - simHeight, barWidth - 2, simHeight);
        ctx.globalAlpha = 1.0;
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, themeColor, accentColor]);

  // Audio progress slider — free seek across the whole track.
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <div
      className="glass-card flex-column"
      style={{
        border: `1px solid ${isPlaying ? themeColor : 'var(--color-obsidian-border)'}`,
        boxShadow: isPlaying ? `0 15px 40px rgba(0, 0, 0, 0.7), 0 0 25px ${themeColor}12` : '',
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Registration gate — appears when a logged-out visitor taps Download */}
      {showAuthGate && (
        <div
          style={{
            position: "absolute", inset: 0,
            background: "rgba(9, 9, 12, 0.9)",
            backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "2rem", borderRadius: "20px", zIndex: 100, textAlign: "center",
            animation: "fadeIn 0.3s ease forwards",
          }}
        >
          <span style={{ fontSize: "2.5rem", filter: "drop-shadow(0 0 8px var(--color-gold))" }}>⬇️</span>
          <h3 className="headline-md" style={{ marginBlockEnd: "0.5rem", fontSize: "1.3rem", color: "#fff" }}>
            Register to download
          </h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", maxWidth: 340, lineHeight: 1.5, marginBlockEnd: "1.5rem" }}>
            Your track is ready to play. Create a free account to keep the file — we&apos;ll email you a magic link.
          </p>
          <form onSubmit={sendMagicLink} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 300 }}>
            <input
              type="email"
              className="form-input"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="you@email.com"
              required
              style={{ background: "rgba(255,255,255,0.03)" }}
            />
            <button type="submit" className="btn-premium btn-gold" style={{ width: "100%", minBlockSize: 42, fontSize: "0.82rem" }}>
              Send magic link &rarr;
            </button>
          </form>
          {authMsg && (
            <div style={{ marginBlockStart: "1rem", fontSize: "0.8rem", color: authMsg.startsWith("Check") ? "#4ade80" : "var(--color-text-secondary)" }}>
              {authMsg}
            </div>
          )}
          <button
            onClick={() => setShowAuthGate(false)}
            style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: "0.75rem", marginBlockStart: "1.25rem", cursor: "pointer", textDecoration: "underline" }}
          >
            Keep listening
          </button>
        </div>
      )}

      {/* Visualizer Meta — truthful only: the user's name + a vibe label from their own tone choice. */}
      <div className="visualizer-card-meta">
        <span className={`visualizer-subtitle ${highEnergy ? "active-crimson" : ""}`}>
          {highEnergy ? "🔥 High-Energy Session" : "🪨 Deep & Reflective Session"}
        </span>
        <h3 className="visualizer-title">
          {name}&apos;s Personal Battle Speech
        </h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", marginBlockStart: "0.25rem" }}>
          Personalized to your story — in the track&apos;s own voice.
        </p>
      </div>

      {/* HTML5 Canvas Visualizer */}
      <div className="arena-visualizer-container">
        <canvas ref={canvasRef} className="canvas-visualizer" />
      </div>

      {/* Personalized track, streamed same-origin from the cloud model */}
      <audio
        ref={audioRef}
        src={`/api/audio?id=${sessionId}`}
        crossOrigin="anonymous"
        preload="auto"
      />

      {/* Custom Player HUD Panel */}
      <div className="flex-column" style={{ gap: "1rem", marginBlockStart: "1.5rem" }}>
        {/* Timeline Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%" }}>
          <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleProgressChange}
            style={{
              flex: 1,
              height: "4px",
              accentColor: themeColor,
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "2px",
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons Control Pack */}
        <div className="player-controls" style={{ position: "relative" }}>
          <button
            onClick={togglePlay}
            className="play-pause-btn"
            style={{
              background: isPlaying ? themeColor : "#ffffff",
              color: isPlaying ? "#ffffff" : "#000000",
              boxShadow: isPlaying ? `0 4px 20px ${themeColor}60` : "0 4px 15px rgba(255,255,255,0.25)"
            }}
            aria-label={isPlaying ? "Pause your speech" : "Play your speech"}
          >
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginInlineStart: "2px" }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Download — gated behind login. Free users can play; keeping the file needs an account. */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadState === "working"}
            style={{
              position: "absolute",
              right: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.78rem",
              color: "var(--color-gold)",
              cursor: "pointer",
              background: "rgba(255,215,0,0.08)",
              padding: "0.45rem 0.8rem",
              borderRadius: "8px",
              border: "1px solid rgba(255,215,0,0.3)",
              fontWeight: 600,
            }}
            aria-label="Download track"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z" />
            </svg>
            <span>{downloadState === "working" ? "…" : downloadState === "error" ? "Retry" : "Download"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
