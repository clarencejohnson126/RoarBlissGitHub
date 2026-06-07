"use client";

import React, { useState } from "react";
import OnboardingForm from "@/components/OnboardingForm";
import TeaserPreview from "@/components/TeaserPreview";
import AudioVisualizer from "@/components/AudioVisualizer";
import AccountPanel from "@/components/AccountPanel";

interface OnboardingData {
  battlefield: string;
  name: string;
  family: string;
  location: string;
  struggle: string;
  champion: string;
  email: string;
  paid: boolean;
  personalization: 25 | 50 | 75 | 100;
  language: string;
  prompt: string;
  tone: string;
  file: File | null;
}

export default function Home() {
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [sessionId, setSessionId] = useState("");
 
  // Waitlist email states
  const [email, setEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
 
  const handleOnboardingComplete = (data: OnboardingData) => {
    setOnboardingData(data);
    setIsProcessing(true);
  };

  const handleLoaderComplete = (sessId: string) => {
    setSessionId(sessId);
    setIsProcessing(false);
    setIsComplete(true);
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setWaitlistStatus({ type: "loading", message: "Securing your spot..." });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: onboardingData?.name || "Warrior",
          battlefield: onboardingData?.battlefield || "General self-mastery",
          struggle: onboardingData?.struggle || "No details",
          champion: onboardingData?.champion || "Eric Thomas",
        }),
      });

      const resData = await response.json();

      if (response.ok) {
        setWaitlistStatus({
          type: "success",
          message: resData.message || "Your spot has been successfully secured in the arena!",
        });
        setEmail("");
      } else {
        setWaitlistStatus({
          type: "error",
          message: resData.error || "Failed to submit. Please try again.",
        });
      }
    } catch (error) {
      console.error("Waitlist error:", error);
      setWaitlistStatus({
        type: "error",
        message: "Network error in the arena. Please try again.",
      });
    }
  };

  const resetSimulator = () => {
    setOnboardingData(null);
    setIsProcessing(false);
    setIsComplete(false);
    setSessionId("");
  };

  return (
    <div className="flex-column" style={{ minHeight: "100vh" }}>
      {/* Upper Navigation HUD */}
      <header
        style={{
          width: "100%",
          padding: "1.5rem 2rem",
          borderBottom: "1px solid var(--color-obsidian-border)",
          background: "rgba(10, 10, 12, 0.4)",
          backdropFilter: "blur(8px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Custom SVG Gradient Logo */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ filter: "drop-shadow(0 0 8px var(--color-gold))" }}>
            <path d="M12 2L2 22h20L12 2z" fill="url(#logo-grad)" />
            <defs>
              <linearGradient id="logo-grad" x1="2" y1="22" x2="22" y2="2">
                <stop offset="0%" stopColor="var(--color-crimson)" />
                <stop offset="100%" stopColor="var(--color-gold)" />
              </linearGradient>
            </defs>
          </svg>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: "1.3rem",
              letterSpacing: "-0.02em",
              background: "linear-gradient(to right, #ffffff, var(--color-gold))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            ROAR BLISS
          </span>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <AccountPanel />
          <a
            href="#arena"
            style={{
              fontSize: "0.85rem",
              color: "var(--color-text-secondary)",
              textDecoration: "none",
              fontFamily: "var(--font-heading)",
              fontWeight: 500,
              transition: "color 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#ffffff")}
            onMouseOut={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
          >
            Interactive Demo
          </a>
          <a
            href="#waitlist"
            style={{
              fontSize: "0.85rem",
              color: "var(--color-gold)",
              textDecoration: "none",
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              transition: "text-shadow 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.textShadow = "0 0 8px var(--color-gold-glow)")}
            onMouseOut={(e) => (e.currentTarget.style.textShadow = "none")}
          >
            Join Waitlist
          </a>
        </div>
      </header>

      {/* Hero Epic Headline */}
      <main style={{ flex: 1, padding: "2.5rem 1.5rem" }} className="flex-center">
        <div style={{ maxWidth: "1200px", width: "100%" }} className="flex-column">
          <section className="text-center" style={{ marginBlockEnd: "3.5rem" }}>
            <span
              style={{
                fontSize: "0.8rem",
                color: "var(--color-gold)",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                fontWeight: 700,
                display: "inline-block",
                marginBlockEnd: "0.75rem",
                background: "rgba(255, 215, 0, 0.08)",
                padding: "0.35rem 0.85rem",
                borderRadius: "20px",
                border: "1px solid rgba(255, 215, 0, 0.15)",
              }}
            >
              Option A: UGC safe harbor pipeline
            </span>
            <h1 className="headline-xl" style={{ marginBlockEnd: "1.25rem" }}>
              Turn Iconic Speeches Into Your <br />
              <span className="text-highlight-gold">Personal Battle Hymns</span>
            </h1>
            <p
              style={{
                color: "var(--color-text-secondary)",
                fontSize: "1.1rem",
                maxWidth: "680px",
                margin: "0 auto",
                lineHeight: "1.6",
                textWrap: "pretty",
              }}
            >
              Surgically graft your name, family anchors, and specific struggles directly inside legendary motivational tracks. 
              The engine clones the speaker&apos;s exact voice, emotion, and backing music with <strong>exactly 0 ms timeline drift</strong>.
            </p>
          </section>

          {/* Core Interactive Layout Split */}
          <div className="grid-layout" id="arena">
            {/* Left Column: Interactive Simulation Console */}
            <div className="flex-column" style={{ gap: "1rem" }}>
              {!onboardingData && (
                <OnboardingForm onComplete={handleOnboardingComplete} />
              )}

              {onboardingData && isProcessing && (
                <TeaserPreview formData={onboardingData} onComplete={handleLoaderComplete} />
              )}

              {onboardingData && isComplete && (
                <div className="flex-column" style={{ gap: "1rem" }}>
                  <AudioVisualizer formData={onboardingData} sessionId={sessionId} />
                  <button
                    onClick={resetSimulator}
                    className="btn-premium btn-secondary"
                    style={{ minBlockSize: "44px", alignSelf: "center", fontSize: "0.8rem" }}
                  >
                    &larr; Configure New Personalization Profile
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Key Focus Marketing & Private Waitlist */}
            <div className="flex-column" style={{ gap: "2rem" }}>
              {/* Waitlist Subscription Card */}
              <div className="glass-card glow-gold" id="waitlist" style={{ border: "1px solid rgba(255, 215, 0, 0.08)" }}>
                <h2 className="headline-md" style={{ marginBlockEnd: "0.5rem" }}>
                  Lock In Your <span className="text-highlight-gold">Ego-Track Priority</span>
                </h2>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "0.88rem", lineHeight: "1.5", marginBlockEnd: "1.5rem" }}>
                  We are opening slots on our scalable GPU cloud to let you upload any custom MP3 (speeches, movie dialogue, podcast stems) and map bespoke Ego-Tracks instantly. Lock in early access:
                </p>

                <form onSubmit={handleWaitlistSubmit} className="flex-column">
                  <div className="form-group" style={{ marginBlockEnd: "1rem" }}>
                    <label className="form-label" htmlFor="waitlist-email">Secure Waitlist Access</label>
                    <input
                      id="waitlist-email"
                      type="email"
                      className="form-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-premium btn-gold"
                    style={{ width: "100%" }}
                    disabled={waitlistStatus.type === "loading"}
                  >
                    {waitlistStatus.type === "loading" ? "Securing Spot..." : "Secure Early Access &rarr;"}
                  </button>
                </form>

                {waitlistStatus.type !== "idle" && (
                  <div
                    style={{
                      marginBlockStart: "1.25rem",
                      padding: "0.85rem 1rem",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      border: "1px solid",
                      background: waitlistStatus.type === "success" ? "rgba(74, 222, 128, 0.06)" : "rgba(230, 57, 70, 0.06)",
                      borderColor: waitlistStatus.type === "success" ? "rgba(74, 222, 128, 0.2)" : "rgba(230, 57, 70, 0.2)",
                      color: waitlistStatus.type === "success" ? "#4ade80" : "#f87171",
                    }}
                  >
                    {waitlistStatus.message}
                  </div>
                )}
              </div>

              {/* Precise Supporting Features HUD cards */}
              <div className="flex-column" style={{ gap: "1rem" }}>
                <h3 className="headline-md" style={{ fontSize: "1.1rem" }}>
                  Core System Utilities
                </h3>

                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    padding: "1rem",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--color-obsidian-border)",
                    borderRadius: "12px",
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>⚡</span>
                  <div>
                    <h4 style={{ fontSize: "0.92rem", fontWeight: "600", marginBlockEnd: "0.15rem" }}>Autopilot Soundscape Sync</h4>
                    <p style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
                      Scans backing orchestrals, detecting beat and frequency peak levels. Automatically maps emotional overlays into high-tension valleys.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    padding: "1rem",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--color-obsidian-border)",
                    borderRadius: "12px",
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>🎚️</span>
                  <div>
                    <h4 style={{ fontSize: "0.92rem", fontWeight: "600", marginBlockEnd: "0.15rem" }}>High-Definition Stem Isolation</h4>
                    <p style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
                      One-click drag-and-drop splitter. Automatically isolates primary vocal and backing accompaniment stems on any uploaded MP3.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    padding: "1rem",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--color-obsidian-border)",
                    borderRadius: "12px",
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>👑</span>
                  <div>
                    <h4 style={{ fontSize: "0.92rem", fontWeight: "600", marginBlockEnd: "0.15rem" }}>The Gladiator Arena Player</h4>
                    <p style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
                      Dark obsidian focus visualizer pulsing glowing particles in real-time sync with speech energy frequencies (ET crimson & Les Brown gold).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Strategic Footer */}
      <footer
        style={{
          width: "100%",
          padding: "2rem",
          borderTop: "1px solid var(--color-obsidian-border)",
          background: "rgba(5, 5, 7, 0.8)",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--color-text-muted)",
        }}
      >
        <p style={{ marginBlockEnd: "0.5rem" }}>
          &copy; {new Date().getFullYear()} Roar Bliss Inc. Engineered with Google Antigravity Cross-Platform SDK. All rights reserved.
        </p>
        <p>
          Privacy Policy | Terms of Service | Option A local processing utility safe harbor declarations.
        </p>
      </footer>
    </div>
  );
}
