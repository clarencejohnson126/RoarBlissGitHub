"use client";

import React, { useRef, useState, useEffect } from "react";

interface AudioVisualizerProps {
  formData: {
    battlefield: string;
    name: string;
    family: string;
    location: string;
    struggle: string;
    champion: string;
  };
  sessionId: string;
}

export default function AudioVisualizer({ formData, sessionId }: AudioVisualizerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // The free track is already capped at 45s by the pipeline, so it plays in full (no preview lock).
  const [isLocked, setIsLocked] = useState(false);
  const [showLockOverlay, setShowLockOverlay] = useState(false);
  const [email, setEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  // Web Audio Nodes refs to prevent re-connections
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceConnectedRef = useRef(false);

  const isGladiator = formData.champion === "Eric Thomas";
  const themeColor = isGladiator ? "#e63946" : "#ffd700"; // Crimson vs Gold
  const accentColor = isGladiator ? "#ff8a93" : "#fff8c4";

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

  // Timeline Progress
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
      // Auto-lock interceptor precisely at 30 seconds (or when preview finishes)
      if (isLocked && audio.currentTime >= 29.8) {
        audio.pause();
        setIsPlaying(false);
        audio.currentTime = 30; // snap
        setCurrentTime(30);
        setShowLockOverlay(true);
      }
    };
    
    const handleDurationChange = () => {
      // Preview duration is capped at 30s, Full duration is real length
      setDuration(isLocked ? 30 : (audio.duration || 180));
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      if (isLocked) {
        setShowLockOverlay(true);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isLocked]);

  // Handle Waitlist Email Unlock Submit
  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setWaitlistStatus({ type: "loading", message: "Verifying credentials..." });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: formData.name,
          battlefield: formData.battlefield,
          struggle: formData.struggle,
          champion: formData.champion,
        }),
      });

      if (response.ok) {
        setWaitlistStatus({
          type: "success",
          message: "Waitlist verified! Full track unlocked successfully.",
        });
        
        // Short dramatic transition before unlock
        setTimeout(() => {
          setIsLocked(false);
          setShowLockOverlay(false);
          
          // Swap source and play from 30s
          if (audioRef.current) {
            const wasPlaying = isPlaying;
            audioRef.current.pause();
            
            // Trigger browser reload of new src
            audioRef.current.src = `/api/audio?id=${sessionId}`;
            audioRef.current.load();
            
            audioRef.current.oncanplay = () => {
              if (audioRef.current) {
                audioRef.current.currentTime = 30; // Resume where they left off
                setCurrentTime(30);
                audioRef.current.play();
                setIsPlaying(true);
                audioRef.current.oncanplay = null; // Clean up
              }
            };
          }
        }, 1000);
      } else {
        const resData = await response.json();
        setWaitlistStatus({
          type: "error",
          message: resData.error || "Lock server error. Try again.",
        });
      }
    } catch (err) {
      console.error("Unlock error:", err);
      setWaitlistStatus({
        type: "error",
        message: "Failed to connect to waitlist database.",
      });
    }
  };

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

  // Audio Progress Slider click
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    
    // Capping seeks if locked
    if (isLocked && newTime >= 30) {
      audio.currentTime = 30;
      setCurrentTime(30);
      setShowLockOverlay(true);
      return;
    }
    
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
      {/* Dynamic Waitlist Glass Lock Overlay */}
      {showLockOverlay && (
        <div 
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(9, 9, 12, 0.88)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            borderRadius: "20px",
            zIndex: 100,
            textAlign: "center",
            animation: "fadeIn 0.3s ease forwards"
          }}
        >
          <span style={{ fontSize: "2.5rem", filter: "drop-shadow(0 0 8px var(--color-gold))" }}>🔒</span>
          <h3 className="headline-md" style={{ marginBlockEnd: "0.5rem", fontSize: "1.3rem", color: "#ffffff" }}>
            Ego-Track Locked
          </h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", maxWidth: "340px", lineHeight: "1.5", marginBlockEnd: "1.5rem" }}>
            You are listening to a 30-second personalized preview. Secure your place on the priority waitlist to immediately unlock the full track!
          </p>
          
          <form onSubmit={handleUnlockSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: "300px" }}>
            <div className="form-group" style={{ textAlign: "left" }}>
              <label className="form-label" htmlFor="popup-email" style={{ fontSize: "0.75rem" }}>Email Address</label>
              <input
                id="popup-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email to unlock"
                required
                disabled={waitlistStatus.type === "loading"}
                style={{ background: "rgba(255,255,255,0.03)" }}
              />
            </div>
            <button 
              type="submit" 
              className="btn-premium btn-gold" 
              style={{ width: "100%", minBlockSize: "42px", fontSize: "0.82rem" }}
              disabled={waitlistStatus.type === "loading"}
            >
              {waitlistStatus.type === "loading" ? "Unlocking Track..." : "Unlock Full Track &rarr;"}
            </button>
          </form>

          {waitlistStatus.message && (
            <div
              style={{
                marginBlockStart: "1rem",
                fontSize: "0.8rem",
                color: waitlistStatus.type === "success" ? "#4ade80" : "var(--color-crimson)"
              }}
            >
              {waitlistStatus.message}
            </div>
          )}

          <button
            onClick={() => setShowLockOverlay(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: "0.75rem",
              marginBlockStart: "1.25rem",
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            Go Back & Review Profile
          </button>
        </div>
      )}

      {/* Visualizer Meta */}
      <div className="visualizer-card-meta">
        <span className={`visualizer-subtitle ${isGladiator ? "active-crimson" : ""}`}>
          {isGladiator ? "🥋 Gladiator Arena Focus Session" : "👑 The Sage Wisdom Suite"}
        </span>
        <h3 className="visualizer-title">
          {formData.name}&apos;s Personalized Battle Hymn
        </h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", marginBlockStart: "0.25rem" }}>
          Surgically Grafted Voice: Cloned {formData.champion} Model
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
            max={duration || 30}
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
            aria-label={isPlaying ? "Pause customized speech preview" : "Play customized speech preview"}
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
          
          {isLocked && (
            <div
              onClick={() => setShowLockOverlay(true)}
              style={{
                position: "absolute",
                right: "1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.72rem",
                color: "var(--color-gold)",
                cursor: "pointer",
                background: "rgba(255,215,0,0.08)",
                padding: "0.25rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid rgba(255,215,0,0.25)",
                fontWeight: "600"
              }}
            >
              <span>🔒 30s Capped</span>
            </div>
          )}
        </div>
      </div>

      {/* Custom details display HUD */}
      <div
        style={{
          marginBlockStart: "1.5rem",
          padding: "1rem",
          background: "rgba(0,0,0,0.3)",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.03)",
          fontSize: "0.8rem",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          color: "var(--color-text-secondary)",
        }}
      >
        <div>
          <span style={{ color: "var(--color-text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase" }}>Current Battlefield</span>
          <strong style={{ color: "#ffffff" }}>{formData.battlefield}</strong>
        </div>
        <div>
          <span style={{ color: "var(--color-text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase" }}>Target Arena</span>
          <strong style={{ color: "#ffffff" }}>{formData.location}</strong>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <span style={{ color: "var(--color-text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase" }}>Grafted Struggle Narrative</span>
          <p style={{ color: "#ffffff", fontSize: "0.78rem", lineBreak: "anywhere", marginBlockStart: "0.15rem" }}>
            &ldquo;...Swapping in {formData.name} fighting hard in {formData.location} for legacy of {formData.family} to conquer doubts of {formData.struggle}...&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}
