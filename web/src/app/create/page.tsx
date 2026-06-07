"use client";

import React, { useState } from "react";
import OnboardingForm from "@/components/OnboardingForm";
import TeaserPreview from "@/components/TeaserPreview";
import AudioVisualizer from "@/components/AudioVisualizer";
import Navbar from "@/components/Navbar";

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

export default function CreatePage() {
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [sessionId, setSessionId] = useState("");

  const handleOnboardingComplete = (data: OnboardingData) => {
    setOnboardingData(data);
    setIsProcessing(true);
  };

  const handleLoaderComplete = (sessId: string) => {
    setSessionId(sessId);
    setIsProcessing(false);
    setIsComplete(true);
  };

  const resetSimulator = () => {
    setOnboardingData(null);
    setIsProcessing(false);
    setIsComplete(false);
    setSessionId("");
  };

  return (
    <div className="flex-column" style={{ minHeight: "100vh" }}>
      <Navbar />
      <section className="section-pad" style={{ paddingBlockStart: "3rem" }}>
        <span className="section-eyebrow">Create</span>
        <h1 className="section-head">Your story, your roar.</h1>
        <p className="section-sub">
          Upload your audio, choose your battle, add your story — and we&apos;ll create your speech while
          preserving the emotional tone and music.
        </p>

        <div style={{ maxWidth: "760px", marginBlockStart: "2.5rem" }} className="flex-column">
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
      </section>
    </div>
  );
}
