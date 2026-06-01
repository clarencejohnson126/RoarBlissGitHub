"use client";

import React, { useState, useRef } from "react";

interface OnboardingFormProps {
  onComplete: (data: {
    battlefield: string;
    name: string;
    family: string;
    location: string;
    struggle: string;
    champion: string;
    email: string;
    file: File | null;
  }) => void;
}

export default function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const [step, setStep] = useState(1);
  const [usePreloaded, setUsePreloaded] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [battlefield, setBattlefield] = useState("Building an Empire");
  const [name, setName] = useState("Clarence");
  const [family, setFamily] = useState("Lean and Elanese");
  const [location, setLocation] = useState("Mannheim, Germany");
  const [struggle, setStruggle] = useState("Late-night coding sessions and doubts");
  const [champion, setChampion] = useState("Eric Thomas");
  const [email, setEmail] = useState("");

  // Drag and Drop States
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (f: File) => {
    if (!f.type.startsWith("audio/") && !f.name.endsWith(".mp3") && !f.name.endsWith(".wav")) {
      alert("Please upload a valid audio file (.mp3 or .wav)");
      return;
    }
    // Limit to 15MB
    if (f.size > 15 * 1024 * 1024) {
      alert("Audio file is too large. Maximum size is 15MB.");
      return;
    }
    setFile(f);
    setUsePreloaded(false); // Uncheck preloaded if they upload
  };

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setUsePreloaded(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      battlefield,
      name,
      family,
      location,
      struggle,
      champion,
      email,
      file: usePreloaded ? null : file,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card flex-column" style={{ minHeight: "480px" }}>
      {/* STEP 1: UPLOAD AUDIO SOURCE */}
      {step === 1 && (
        <div className="flex-column" style={{ gap: "1.5rem" }}>
          <div>
            <h2 className="headline-md" style={{ marginBlockEnd: "0.5rem" }}>
              1. Choose Your <span className="text-highlight-gold">Audio Source</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", lineHeight: "1.4" }}>
              Upload your favorite motivational speech, song, or podcast stem to customize. Alternatively, test instantly with our preloaded motivational speaker track.
            </p>
          </div>

          {/* Toggle for Preloaded Audio */}
          <div 
            onClick={() => {
              setUsePreloaded(true);
              setFile(null);
            }}
            className={`radio-card ${usePreloaded ? "champion-gladiator" : ""}`}
            style={{ cursor: "pointer", border: usePreloaded ? "1px solid var(--color-gold)" : "1px solid var(--color-obsidian-border)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <input
                type="radio"
                name="audio-source"
                checked={usePreloaded}
                onChange={() => {}}
                style={{ accentColor: "var(--color-gold)" }}
              />
              <span className="radio-card-title">⚡ Preloaded Motivational Speech</span>
            </div>
            <span className="radio-card-desc" style={{ display: "block", marginBlockStart: "0.25rem" }}>
              "I CAN DO THIS" Special Edition (Includes pre-split vocal & accompaniment stems). Perfect for zero-friction local testing.
            </span>
          </div>

          <div style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.8rem", fontWeight: "600" }}>OR</div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileInput}
            className={`drop-zone ${isDragOver ? "drag-over" : ""} ${file ? "drop-zone-selected" : ""}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*"
              style={{ display: "none" }}
            />
            {file ? (
              <>
                <span className="drop-zone-icon">🎵</span>
                <span className="radio-card-title" style={{ color: "#4ade80" }}>File Selected Successfully</span>
                <p className="drop-zone-text" style={{ fontWeight: "500", color: "var(--color-text-primary)" }}>
                  {file.name} ({Math.round(file.size / (1024 * 1024) * 100) / 100} MB)
                </p>
                <button
                  type="button"
                  onClick={removeFile}
                  style={{
                    background: "rgba(230, 57, 70, 0.15)",
                    color: "var(--color-crimson)",
                    border: "1px solid rgba(230, 57, 70, 0.3)",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    marginBlockStart: "0.5rem",
                  }}
                >
                  Remove & Use Preloaded
                </button>
              </>
            ) : (
              <>
                <span className="drop-zone-icon">📤</span>
                <span className="radio-card-title">Upload Custom Audio File</span>
                <span className="drop-zone-text">
                  Drag & drop your MP3/WAV here, or click to browse<br />
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Maximum file size: 15MB</span>
                </span>
              </>
            )}
          </div>

          <button 
            type="button" 
            onClick={nextStep} 
            className="btn-premium btn-gold margin-top-md"
            style={{ width: "100%" }}
            disabled={!usePreloaded && !file}
          >
            Configure Focus Profile &rarr;
          </button>
        </div>
      )}

      {/* STEP 2: CHOOSE YOUR BATTLEFIELD */}
      {step === 2 && (
        <div className="flex-column" style={{ gap: "1.5rem" }}>
          <div>
            <h2 className="headline-md" style={{ marginBlockEnd: "0.5rem" }}>
              2. Choose Your <span className="text-highlight-gold">Battlefield</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", lineHeight: "1.4" }}>
              Where are you currently fighting your greatest battles? Select the domain where you need the ultimate personalized alignment.
            </p>
          </div>

          <div className="radio-cards" style={{ gridTemplateColumns: "1fr" }}>
            <label className={`radio-card ${battlefield === "Building an Empire" ? "champion-gladiator" : ""}`}>
              <input
                type="radio"
                name="battlefield"
                value="Building an Empire"
                checked={battlefield === "Building an Empire"}
                onChange={() => setBattlefield("Building an Empire")}
              />
              <span className="radio-card-title">💼 Building an Empire</span>
              <span className="radio-card-desc">
                For entrepreneurs, creators, and builders pushing through isolating business sprints, launch fatigue, and corporate escape.
              </span>
            </label>

            <label className={`radio-card ${battlefield === "Pushing Physical Limits" ? "champion-gladiator" : ""}`}>
              <input
                type="radio"
                name="battlefield"
                value="Pushing Physical Limits"
                checked={battlefield === "Pushing Physical Limits"}
                onChange={() => setBattlefield("Pushing Physical Limits")}
              />
              <span className="radio-card-title">⚡ Pushing Physical Limits</span>
              <span className="radio-card-desc">
                For athletes, gym-goers, and runners breaking personal records, conquering pain thresholds, and training at extreme hours.
              </span>
            </label>

            <label className={`radio-card ${battlefield === "The Personal Comeback" ? "champion-gladiator" : ""}`}>
              <input
                type="radio"
                name="battlefield"
                value="The Personal Comeback"
                checked={battlefield === "The Personal Comeback"}
                onChange={() => setBattlefield("The Personal Comeback")}
              />
              <span className="radio-card-title">🔥 The Personal Comeback</span>
              <span className="radio-card-desc">
                For those rising from personal setbacks, doubts, rebuilding relationships, or recovering from deep crises.
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button type="button" onClick={prevStep} className="btn-premium btn-secondary" style={{ flex: 1 }}>
              Back
            </button>
            <button type="button" onClick={nextStep} className="btn-premium btn-gold" style={{ flex: 2 }}>
              Deploy Profile &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: MAP YOUR EMOTIONAL ANCHORS */}
      {step === 3 && (
        <div className="flex-column" style={{ gap: "1.25rem" }}>
          <div>
            <h2 className="headline-md" style={{ marginBlockEnd: "0.5rem" }}>
              3. Map Your <span className="text-highlight-crimson">Emotional Anchors</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", lineHeight: "1.4" }}>
              Provide the real facts of your life. The engine uses these details to surgically swap words and craft highly targeted struggle narratives.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="user-name">Your First Name</label>
            <input
              id="user-name"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Clarence"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="family-names">
              Who are you fighting for? 
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Names of kids, family, or legacy</span>
            </label>
            <input
              id="family-names"
              type="text"
              className="form-input"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              placeholder="e.g., Lean and Elanese"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="user-location">Your Current Arena / Location</label>
            <input
              id="user-location"
              type="text"
              className="form-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Mannheim, Germany"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="user-struggle">
              Your Primary Pain, Struggle or Doubt
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Be extremely precise</span>
            </label>
            <textarea
              id="user-struggle"
              className="form-textarea"
              value={struggle}
              onChange={(e) => setStruggle(e.target.value)}
              placeholder="e.g., late-night coding fatigue, financial stress, or people doubting your path"
              required
            />
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button type="button" onClick={prevStep} className="btn-premium btn-secondary" style={{ flex: 1 }}>
              Back
            </button>
            <button type="button" onClick={nextStep} className="btn-premium btn-gold" style={{ flex: 2 }}>
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: CHOOSE YOUR MENTOR */}
      {step === 4 && (
        <div className="flex-column" style={{ gap: "1.5rem" }}>
          <div>
            <h2 className="headline-md" style={{ marginBlockEnd: "0.5rem" }}>
              4. Choose Your <span className="text-highlight-gold">Mentor</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", lineHeight: "1.4" }}>
              Select the voice model whose emotional frequency fits your battlefield. 
            </p>
          </div>

          <div className="radio-cards">
            <label className={`radio-card ${champion === "Eric Thomas" ? "champion-gladiator" : ""}`}>
              <input
                type="radio"
                name="champion"
                value="Eric Thomas"
                checked={champion === "Eric Thomas"}
                onChange={() => setChampion("Eric Thomas")}
              />
              <span className="radio-card-title text-highlight-crimson">🥋 The Gladiator</span>
              <span className="radio-card-subtitle" style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Eric Thomas Style</span>
              <span className="radio-card-desc">
                High-energy, intense, gravelly roars. Perfect for pushing past exhaustion, workout climaxes, and aggressive focus splits.
              </span>
            </label>

            <label className={`radio-card ${champion === "Les Brown" ? "champion-gladiator" : ""}`}>
              <input
                type="radio"
                name="champion"
                value="Les Brown"
                checked={champion === "Les Brown"}
                onChange={() => setChampion("Les Brown")}
              />
              <span className="radio-card-title text-highlight-gold">👑 The Sage</span>
              <span className="radio-card-subtitle" style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Les Brown Style</span>
              <span className="radio-card-desc">
                Resonant, deep, wise reflections. Perfect for re-framing pain, overcoming doubts, and finding inner strategic grit.
              </span>
            </label>
          </div>

          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label className="form-label" htmlFor="user-email">
              Email (optional)
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.5rem" }}>
                — we&apos;ll send the track when ready (5-7 min). You can also just wait on this page.
              </span>
            </label>
            <input
              id="user-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button type="button" onClick={prevStep} className="btn-premium btn-secondary" style={{ flex: 1 }}>
              Back
            </button>
            <button type="submit" className="btn-premium btn-gold" style={{ flex: 2 }}>
              Graft My Ego-Track &rarr;
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
