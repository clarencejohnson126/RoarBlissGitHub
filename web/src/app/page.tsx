"use client";

import React, { useState, useRef } from "react";
import OnboardingForm from "@/components/OnboardingForm";
import TeaserPreview from "@/components/TeaserPreview";
import AudioVisualizer from "@/components/AudioVisualizer";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProcessBar from "@/components/ProcessBar";
import HowItWorks from "@/components/HowItWorks";
import BattleTemplates from "@/components/BattleTemplates";
import PersonalizationDepth from "@/components/PersonalizationDepth";
import WhyRoarBliss from "@/components/WhyRoarBliss";
import SafeUseNote from "@/components/SafeUseNote";

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

  // CTAs scroll the user down into the existing create flow (they never auto-start the pipeline).
  const createRef = useRef<HTMLElement>(null);
  const startCreate = () => createRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

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
          champion: onboardingData?.champion || "High-Energy",
        }),
      });

      const resData = await response.json();

      if (response.ok) {
        setWaitlistStatus({
          type: "success",
          message: resData.message || "You're on the list — we'll be in touch.",
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
        message: "Network error. Please try again.",
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
      <Navbar onGetStarted={startCreate} />
      <HeroSection onCreate={startCreate} onDemo={startCreate} />
      <ProcessBar onStep={startCreate} />

      <HowItWorks />
      <BattleTemplates onSelect={startCreate} />
      <PersonalizationDepth />
      <WhyRoarBliss />

      {/* Pricing */}
      <section id="pricing" className="section-pad" style={{ textAlign: "center" }}>
        <span className="section-eyebrow">Pricing</span>
        <h2 className="section-head">Start free. Go deeper when you&apos;re ready.</h2>
        <p className="section-sub" style={{ marginInline: "auto" }}>
          Your first preview is free. Unlock full-length speeches and every personalization depth with a
          credit pack — from €5.
        </p>
        <div style={{ marginBlockStart: "2rem" }}>
          <button className="btn-premium btn-gold" onClick={startCreate}>Create My Speech</button>
        </div>
      </section>

      {/* CREATE — the preserved upload → generate flow */}
      <section id="create" ref={createRef} className="section-pad">
        <span className="section-eyebrow">Create</span>
        <h2 className="section-head">Your story, your roar.</h2>
        <div className="grid-layout" id="arena" style={{ marginBlockStart: "2.5rem" }}>
          {/* Left: interactive flow */}
          <div className="flex-column" style={{ gap: "1rem" }}>
            {!onboardingData && <OnboardingForm onComplete={handleOnboardingComplete} />}

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
                  &larr; Create another speech
                </button>
              </div>
            )}
          </div>

          {/* Right: early-access / waitlist */}
          <div className="flex-column" style={{ gap: "2rem" }}>
            <div className="glass-card glow-gold" id="waitlist" style={{ border: "1px solid var(--color-obsidian-border)" }}>
              <h3 className="headline-md" style={{ marginBlockEnd: "0.5rem" }}>
                Get <span className="text-highlight-gold">early access</span>
              </h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.88rem", lineHeight: "1.5", marginBlockEnd: "1.5rem" }}>
                Be first to upload your own audio and create longer, deeper battle speeches as we open
                new capacity.
              </p>

              <form onSubmit={handleWaitlistSubmit} className="flex-column">
                <div className="form-group" style={{ marginBlockEnd: "1rem" }}>
                  <label className="form-label" htmlFor="waitlist-email">Your email</label>
                  <input
                    id="waitlist-email"
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-premium btn-gold"
                  style={{ width: "100%" }}
                  disabled={waitlistStatus.type === "loading"}
                >
                  {waitlistStatus.type === "loading" ? "Securing spot..." : "Join the waitlist"}
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
          </div>
        </div>
      </section>

      <SafeUseNote />

      <footer
        style={{
          width: "100%",
          padding: "2rem",
          borderTop: "1px solid var(--color-obsidian-border)",
          background: "rgba(5, 5, 5, 0.8)",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--color-text-muted)",
        }}
      >
        <p style={{ marginBlockEnd: "0.5rem" }}>
          &copy; {new Date().getFullYear()} Roar Bliss. Your story, your battle, your roar.
        </p>
        <p>Privacy Policy &nbsp;|&nbsp; Terms of Service</p>
      </footer>
    </div>
  );
}
