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
    paid: boolean;
    personalization: 25 | 50 | 75 | 100;
    language: string;
    prompt: string;
    tone: string;
    file: File | null;
  }) => void;
}

export default function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const [step, setStep] = useState(1);
  const [usePreloaded, setUsePreloaded] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [battlefield, setBattlefield] = useState("Discipline");
  const [name, setName] = useState("Clarence");
  const [family, setFamily] = useState("Lean and Elanese");
  const [location, setLocation] = useState("Mannheim, Germany");
  const [struggle, setStruggle] = useState("Late-night coding sessions and doubts");
  const [champion, setChampion] = useState("Eric Thomas");
  const [email, setEmail] = useState("");
  const [paid, setPaid] = useState(false);
  // Core feature 1: how much of the audio becomes the user's (25/50/75/100%).
  const [personalization, setPersonalization] = useState<25 | 50 | 75 | 100>(50);
  // Core feature 2: target language for the generated lines (cloned timbre is kept).
  const [language, setLanguage] = useState("English");
  // Core feature 3: a one-click tone/template OR a free-form prompt (either/or; prompt overrides fields).
  const [tone, setTone] = useState("");
  const [prompt, setPrompt] = useState("");

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
    // Limit to 100MB
    if (f.size > 100 * 1024 * 1024) {
      alert("Audio file is too large. Maximum size is 100MB.");
      return;
    }
    // Enforce a 6-minute maximum (read duration from metadata; accept if it can't be read — the
    // backend caps the window at 6 min anyway).
    const url = URL.createObjectURL(f);
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (probe.duration && probe.duration > 366) {
        alert("Audio is longer than 6 minutes. Please upload a clip up to 6 minutes.");
        return;
      }
      setFile(f);
      setUsePreloaded(false);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setFile(f);
      setUsePreloaded(false);
    };
    probe.src = url;
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
      paid,
      personalization,
      language,
      tone,
      prompt,
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
              Upload your favorite motivational speech, song, or podcast stem to customize. Alternatively, test instantly with our preloaded motivational speaker track.{" "}
              <strong>Tip:</strong> the better the audio quality you give Roar Bliss, the better your result — upload a clean, high-quality track.
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
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Up to 6 minutes · max 100MB</span>
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
              2. Choose Your <span className="text-highlight-gold">Battle</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", lineHeight: "1.4" }}>
              Pick the battle this speech is for — it sets the theme the engine writes toward. Or write
              your own prompt in the next step.
            </p>
          </div>

          <div className="radio-cards">
            {[
              { t: "Discipline", d: "The grind nobody sees — reps, early mornings, quiet work." },
              { t: "Heartbreak", d: "Turn the wound into resolve. Rise from what broke you." },
              { t: "Grief", d: "Carry the loss forward with strength, not silence." },
              { t: "Muscle Gain", d: "Fuel the training — pain thresholds, last sets, records." },
              { t: "Business Comeback", d: "Rebuild after the setback. Back on your feet." },
              { t: "Fatherhood", d: "Be the example, for the ones who watch you." },
              { t: "Confidence", d: "Walk in as the man who already decided." },
              { t: "Dark Season", d: "When it's heaviest — the voice that keeps you standing." },
            ].map((b) => (
              <label key={b.t} className={`radio-card ${battlefield === b.t ? "champion-gladiator" : ""}`}>
                <input
                  type="radio"
                  name="battlefield"
                  value={b.t}
                  checked={battlefield === b.t}
                  onChange={() => setBattlefield(b.t)}
                />
                <span className="radio-card-title">{b.t}</span>
                <span className="radio-card-desc">{b.d}</span>
              </label>
            ))}
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

          {/* Core feature 3a: one-click tone / template — no writing needed (optional) */}
          <div className="form-group">
            <label className="form-label">
              Tone / Template
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.5rem" }}>
                — one click, no writing needed (optional)
              </span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {["Fighter", "Reflective", "Confident", "Grief", "Triumphant"].map((t) => {
                const active = tone === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(active ? "" : t)}
                    className="btn-premium"
                    style={{
                      padding: "0.5rem 0.9rem",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      border: active ? "1px solid var(--color-gold)" : "1px solid rgba(255,255,255,0.12)",
                      background: active ? "rgba(255,215,0,0.12)" : "transparent",
                      color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core feature 3b: free-form prompt — for users who'd rather write it themselves (overrides fields) */}
          <div className="form-group">
            <label className="form-label" htmlFor="user-prompt">
              Or write your own prompt
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.5rem" }}>
                — optional; describe exactly how you want it (this overrides the fields above)
              </span>
            </label>
            <textarea
              id="user-prompt"
              className="form-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Speak to me like an old mentor before my final battle — calm and deep, about rebuilding after I lost my business, for my kids Lian and Lenise."
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
              4. Choose Your <span className="text-highlight-gold">Tone</span>
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", lineHeight: "1.4" }}>
              Pick the tone and delivery style that fits your battle. These are style templates that
              shape the energy and pacing of your speech — not a person.
            </p>
          </div>

          {/* NOTE: the `champion` values ("Eric Thomas"/"Les Brown") are OPAQUE internal tone keys the
              pipeline + player already understand; only the visible LABELS are tone descriptions. */}
          <div className="radio-cards">
            <label className={`radio-card ${champion === "Eric Thomas" ? "champion-gladiator" : ""}`}>
              <input
                type="radio"
                name="champion"
                value="Eric Thomas"
                checked={champion === "Eric Thomas"}
                onChange={() => setChampion("Eric Thomas")}
              />
              <span className="radio-card-title text-highlight-crimson">🔥 High-Energy Drive</span>
              <span className="radio-card-subtitle" style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Intense · fast · commanding</span>
              <span className="radio-card-desc">
                High-energy, intense, gravelly delivery. Perfect for pushing past exhaustion, workout climaxes, and aggressive focus.
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
              <span className="radio-card-title text-highlight-gold">🪨 Deep &amp; Reflective</span>
              <span className="radio-card-subtitle" style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Resonant · calm · wise</span>
              <span className="radio-card-desc">
                Resonant, deep, reflective delivery. Perfect for re-framing pain, overcoming doubts, and finding inner grit.
              </span>
            </label>
          </div>

          {/* Core feature 1: how much of the audio becomes the user's */}
          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label className="form-label">
              Personalization
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.5rem" }}>
                — how much of the audio becomes yours
              </span>
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {([25, 50, 75, 100] as const).map((p) => {
                // Free tier is locked to 75% (the identify-immediately hook); the selector unlocks once paid.
                const active = paid ? personalization === p : p === 75;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => paid && setPersonalization(p)}
                    disabled={!paid}
                    className="btn-premium"
                    style={{
                      flex: 1,
                      padding: "0.6rem 0",
                      fontSize: "0.85rem",
                      cursor: paid ? "pointer" : "not-allowed",
                      opacity: paid || p === 75 ? 1 : 0.4,
                      border: active ? "1px solid var(--color-gold)" : "1px solid rgba(255,255,255,0.12)",
                      background: active ? "rgba(255,215,0,0.12)" : "transparent",
                      color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                    }}
                  >
                    {p}%
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", marginBlockStart: "0.4rem", lineHeight: 1.4 }}>
              {!paid
                ? "Free preview: first 45s, locked at 75% so you hear yourself right away. Unlock 25/50/100% and up to 6 min with a pack."
                : personalization === 100
                ? "100% — a completely new script spoken entirely in the cloned voice."
                : `${personalization}% — keep the original speaker, replace ${personalization}% of the lines with your story.`}
            </p>
          </div>

          {/* Core feature 2: target language (cloned voice is kept). Translation is a BETA feature — offered
              with a clear accent disclaimer (see below) per the founder's go-live decision. (TODO_GAPS.md) */}
          <div className="form-group">
            <label className="form-label" htmlFor="output-language">
              Language
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.5rem" }}>
                — the cloned voice speaks this language
              </span>
            </label>
            <select
              id="output-language"
              className="form-input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {["English", "German", "Spanish", "French", "Italian", "Portuguese", "Dutch", "Polish"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            {language !== "English" && (
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.4rem", lineHeight: 1.4 }}>
                <strong>Beta — translation:</strong> your voice is kept, but the result can carry a strong
                English/American accent. We&apos;re improving this fast.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="user-email">
              Email (optional)
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginInlineStart: "0.5rem" }}>
                — we&apos;ll send the track when ready (up to 5 min). You can also just wait on this page.
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

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.6rem",
              cursor: "pointer",
              padding: "0.75rem",
              background: "rgba(255,215,0,0.04)",
              border: "1px solid rgba(255,215,0,0.15)",
              borderRadius: "8px",
            }}
          >
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              style={{ marginTop: "0.2rem", accentColor: "var(--color-gold)" }}
            />
            <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
              <strong style={{ color: "var(--color-gold)" }}>Bis zu 6 Minuten + alle Stufen freischalten</strong>{" "}
              (Paid · verbraucht 1 Credit). Benötigt Login + Guthaben oben rechts — ohne Haken läuft es
              kostenlos bis 45s, immer 75% personalisiert.
            </span>
          </label>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button type="button" onClick={prevStep} className="btn-premium btn-secondary" style={{ flex: 1 }}>
              Back
            </button>
            <button type="submit" className="btn-premium btn-gold" style={{ flex: 2 }}>
              Create My Speech &rarr;
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
