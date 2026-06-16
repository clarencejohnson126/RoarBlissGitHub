"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileAudio, Sparkles, Mic, Music } from "lucide-react";
import { useCreateFlow } from "./CreateFlowProvider";
import { BATTLES, TONES, LANGUAGES, DEPTHS, type Depth, type Intensity } from "./createData";
import VoicePicker from "./VoicePicker";
import styles from "./create.module.css";

const INTENSITIES: { value: Intensity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/**
 * One-page create for returning users with a saved profile. Everything is pre-filled and inline-editable
 * (name, battle, tone, intensity, depth, language/translate) — drop audio, hit generate. Reuses the
 * existing CreateFlow data + composePayload; "Generate" hands off to StepGenerating (step 6).
 */
export default function QuickCreate({ onFullSetup }: { onFullSetup?: () => void }) {
  const { data, update, toggleArray, file, setFile, presetAudioUrl, setPresetAudioUrl, saveVoice, setSaveVoice, setStep } = useCreateFlow();
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstName = (data.userName || "").trim().split(" ")[0] || "warrior";

  // Instrumental / library-voice path (only for a fresh upload — a saved-voice preset is already a voice).
  const isInstrumental = data.sourceMode === "instrumental" && !presetAudioUrl;
  const needsVoice = isInstrumental && !data.libraryVoiceId;

  // Arriving via dashboard "Use this voice" → ?voice=<saved blob URL> replaces the upload.
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("voice");
      if (v && /^https:\/\/[^ ]*blob\.vercel-storage\.com\//.test(v)) setPresetAudioUrl(v);
    } catch { /* ignore */ }
  }, [setPresetAudioUrl]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setError("");
    const okType = f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name);
    if (!okType) return setError("Please choose an audio file (MP3, WAV, or M4A).");
    if (f.size > 100 * 1024 * 1024) return setError("That file is over 100 MB. Please choose a smaller file.");
    setFile(f);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/bliss/bliss-portrait.png" alt="" className={styles.bgImg} />
        <div className={styles.bgScrim} />
      </div>

      <div className={styles.qcStage}>
        <div className={styles.qcCard}>
          <span className={styles.eyebrow}>Quick create</span>
          <h1 className={styles.headline} style={{ marginBottom: "0.4rem" }}>
            Welcome back, <span className={styles.gold}>{firstName}.</span>
          </h1>
          <p className={styles.sub} style={{ marginTop: 0 }}>
            Your setup is saved. Tweak anything, drop your audio, and forge a new speech — no need to start over.
          </p>

          {/* Name */}
          <div className={styles.qcField}>
            <label className={styles.qcLabel}>Your name</label>
            <input
              className={styles.qcInput}
              value={data.userName}
              onChange={(e) => update({ userName: e.target.value })}
              placeholder="you"
              maxLength={40}
            />
          </div>

          {/* Battle */}
          <div className={styles.qcField}>
            <label className={styles.qcLabel}>Your battle <span className={styles.qcHint}>(pick up to 3)</span></label>
            <div className={styles.qcChips}>
              {BATTLES.map((b) => {
                const on = data.selectedBattles.includes(b.title);
                return (
                  <button
                    key={b.title}
                    type="button"
                    className={`${styles.qcChip} ${on ? styles.qcChipOn : ""}`}
                    onClick={() => toggleArray("selectedBattles", b.title, 3)}
                    aria-pressed={on}
                  >
                    {b.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tone + Intensity */}
          <div className={styles.qcRow}>
            <div className={styles.qcField} style={{ flex: 1 }}>
              <label className={styles.qcLabel}>Tone</label>
              <select className={styles.qcSelect} value={data.primaryTone} onChange={(e) => update({ primaryTone: e.target.value })}>
                <option value="">Choose a tone…</option>
                {TONES.map((t) => (
                  <option key={t.title} value={t.title}>{t.title}</option>
                ))}
              </select>
            </div>
            <div className={styles.qcField} style={{ flex: 1 }}>
              <label className={styles.qcLabel}>Intensity</label>
              <div className={styles.qcSeg}>
                {INTENSITIES.map((i) => (
                  <button
                    key={i.value}
                    type="button"
                    className={`${styles.qcSegBtn} ${data.intensity === i.value ? styles.qcSegBtnOn : ""}`}
                    onClick={() => update({ intensity: i.value })}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Depth — an instrumental has no original voice to keep, so it is ALWAYS a full new voice (100%).
              Hide the 25/50/75/Full tiers and say so instead of offering a meaningless choice (composePayload
              forces full_voice for instrumental regardless of this value). */}
          <div className={styles.qcField}>
            <label className={styles.qcLabel}>How much becomes yours?</label>
            {isInstrumental ? (
              <p className={styles.qcHint}>Instrumental → a complete new voice over your track (always 100%).</p>
            ) : (
              <div className={styles.qcSeg}>
                {DEPTHS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className={`${styles.qcSegBtn} ${data.personalizationDepth === d.value ? styles.qcSegBtnOn : ""}`}
                    onClick={() => update({ personalizationDepth: d.value as Depth })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language / translate — BETA (offered with an accent disclaimer per the founder's go-live decision). */}
          <div className={styles.qcField}>
            <label className={styles.qcLabel}>Language <span className={styles.qcHint}>(translate — keeps the same voice)</span></label>
            <select className={styles.qcSelect} value={data.language} onChange={(e) => update({ language: e.target.value })}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            {data.language && data.language !== "English" && (
              <p className={styles.qcHint} style={{ marginTop: "0.4rem", lineHeight: 1.4 }}>
                <strong>Beta:</strong> translation keeps your voice but can have a strong English/American accent.
              </p>
            )}
          </div>

          {/* Per-speech prompt (optional, not saved to the profile) */}
          <div className={styles.qcField}>
            <label className={styles.qcLabel}>
              Anything specific this time? <span className={styles.qcHint}>(recommended)</span>
            </label>
            <textarea
              className={styles.qcInput}
              style={{ minHeight: 96, resize: "vertical", lineHeight: 1.5 }}
              value={data.customPrompt}
              onChange={(e) => update({ customPrompt: e.target.value })}
              placeholder="A name to mention, a line that matters, everything weighing on you right now — write as much as you need."
              maxLength={1500}
            />
            <div style={{ textAlign: "right", fontSize: "0.75rem", color: data.customPrompt.length >= 1500 ? "var(--color-gold)" : "var(--color-smoke)", marginTop: "0.35rem" }}>
              {data.customPrompt.length}/1500
            </div>
          </div>

          {/* Audio upload (or a saved voice from the dashboard) */}
          <div className={styles.qcField}>
            <label className={styles.qcLabel}>Your audio</label>
            {/* Source mode — only relevant for a fresh upload (a saved voice already has a voice). */}
            {!presetAudioUrl && (
              <div className={styles.sourceModeRow} role="radiogroup" aria-label="Does your file already have a voice?">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isInstrumental}
                  className={`${styles.sourceModeBtn} ${!isInstrumental ? styles.sourceModeBtnOn : ""}`}
                  onClick={() => update({ sourceMode: "voice", libraryVoiceId: "" })}
                >
                  <Mic size={15} style={{ color: "var(--color-gold)", marginBottom: 3 }} />
                  <span className={styles.sourceModeTitle}>It has a voice</span>
                  <span className={styles.sourceModeHint}>A speech or talk — personalize that voice.</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isInstrumental}
                  className={`${styles.sourceModeBtn} ${isInstrumental ? styles.sourceModeBtnOn : ""}`}
                  onClick={() => update({ sourceMode: "instrumental" })}
                >
                  <Music size={15} style={{ color: "var(--color-gold)", marginBottom: 3 }} />
                  <span className={styles.sourceModeTitle}>It&apos;s instrumental</span>
                  <span className={styles.sourceModeHint}>Music only — pick a voice for it.</span>
                </button>
              </div>
            )}
            {presetAudioUrl ? (
              <div className={`${styles.uploadBox} ${styles.uploadBoxOn}`}>
                <Mic size={26} className={styles.uploadIcon} />
                <div className={styles.uploadFile}>Using one of your saved voices</div>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--color-gold)", textDecoration: "underline", cursor: "pointer", marginTop: "0.4rem" }}
                  onClick={() => setPresetAudioUrl("")}
                >
                  Use a fresh upload instead
                </button>
              </div>
            ) : (
            <div
              className={`${styles.uploadBox} ${drag ? styles.uploadBoxDrag : ""} ${file ? styles.uploadBoxOn : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            >
              {file ? (
                <>
                  <FileAudio size={26} className={styles.uploadIcon} />
                  <div className={styles.uploadFile}>{file.name}</div>
                  <div className={styles.uploadMeta}>{(file.size / 1024 / 1024).toFixed(1)} MB · tap to change</div>
                </>
              ) : (
                <>
                  <UploadCloud size={28} className={styles.uploadIcon} />
                  <div className={styles.uploadText}>Drop a speech, song or instrumental</div>
                  <div className={styles.uploadMeta}>MP3, WAV or M4A — first 6 min · drag &amp; drop or browse</div>
                </>
              )}
              <input ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            )}
            {isInstrumental && (
              <>
                <p className={styles.qcLabel} style={{ marginTop: "1rem" }}>Choose your voice</p>
                <VoicePicker selectedId={data.libraryVoiceId} onSelect={(id) => update({ libraryVoiceId: id })} />
              </>
            )}
            {!presetAudioUrl && (
              <p style={{ fontSize: "0.8rem", color: "var(--color-smoke)", marginTop: "0.6rem", lineHeight: 1.5 }}>
                Max 100 MB. Audio over <strong style={{ color: "var(--color-ivory)" }}>6 minutes</strong> is trimmed to the first 6 min. We process it and <strong style={{ color: "var(--color-ivory)" }}>keep only the finished result</strong> — your upload is deleted right after.
              </p>
            )}
            {file && !presetAudioUrl && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.7rem", fontSize: "0.85rem", color: "var(--color-ivory)", cursor: "pointer" }}>
                <input type="checkbox" checked={saveVoice} onChange={(e) => setSaveVoice(e.target.checked)} />
                Save this voice to my profile for next time <span className={styles.qcHint}>(requires sign-in; you can delete it anytime)</span>
              </label>
            )}
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button
            type="button"
            className={styles.btnGold}
            style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}
            disabled={(!file && !presetAudioUrl) || !data.primaryTone || needsVoice}
            onClick={() => (file || presetAudioUrl) && data.primaryTone && !needsVoice && setStep(6)}
          >
            <Sparkles size={17} style={{ marginRight: 8 }} />
            Generate my speech
          </button>

          {onFullSetup && (
            <button type="button" className={styles.qcStartOver} onClick={onFullSetup}>
              Prefer the full guided setup? Start from scratch →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
