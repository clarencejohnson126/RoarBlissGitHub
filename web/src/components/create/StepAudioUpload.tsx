"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileAudio, Mic, Music } from "lucide-react";
import { useCreateFlow } from "./CreateFlowProvider";
import StepShell from "./StepShell";
import VoicePicker from "./VoicePicker";
import styles from "./create.module.css";

export default function StepAudioUpload() {
  const { file, setFile, next, entitlement, data, update } = useCreateFlow();
  const paid = !!entitlement?.tier;
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detection — three layers (see report): (1) this explicit user TOGGLE is the GUARANTEE; (2) the cog
  // is the backend AUTHORITY (demucs+Whisper+pyannote → if no clonable speaker, it routes to the chosen
  // library voice over the bed); (3) an optional fast auto-probe to PRE-SELECT the mode is a future TODO.
  // TODO(auto-probe): decode the picked File via the Web Audio API and run a cheap vocals-energy / VAD
  // heuristic to default sourceMode for the user. Deferred deliberately — a clean client-side probe is
  // non-trivial and the toggle + backend authority already make the path correct + safe without it. Do
  // NOT pull in a heavyweight model for this.
  //
  // Instrumental path: when the user says their file has NO voice, they must pick a library voice.
  const isInstrumental = data.sourceMode === "instrumental";
  const needsVoice = isInstrumental && !data.libraryVoiceId;
  const canContinue = !!file && !needsVoice;

  const pick = (f: File | undefined) => {
    if (!f) return;
    setError("");
    const okType = f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name);
    if (!okType) {
      setError("Please choose an audio file (MP3, WAV, or M4A).");
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError("That file is over 100 MB. Please choose a smaller file.");
      return;
    }
    setFile(f);
  };

  return (
    <StepShell
      image="bliss-path"
      eyebrow="06 · Audio"
      headline={
        <>
          Upload the audio you want to <span className={styles.gold}>transform.</span>
        </>
      }
      sub="Now bring the audio. RoarBliss reshapes it around your story while preserving the emotional tone and music."
      onNext={() => canContinue && next()}
      nextDisabled={!canContinue}
      nextLabel={paid ? "Generate my track" : "Generate Preview"}
    >
      {/* Source mode — the GUARANTEE: the user tells us whether the file has a voice or is instrumental. */}
      <div className={styles.sourceModeRow} role="radiogroup" aria-label="Does your file already have a voice?">
        <button
          type="button"
          role="radio"
          aria-checked={!isInstrumental}
          className={`${styles.sourceModeBtn} ${!isInstrumental ? styles.sourceModeBtnOn : ""}`}
          onClick={() => update({ sourceMode: "voice", libraryVoiceId: "" })}
        >
          <Mic size={16} style={{ color: "var(--color-gold)", marginBottom: 4 }} />
          <span className={styles.sourceModeTitle}>It has a voice</span>
          <span className={styles.sourceModeHint}>A speech or talk — we personalize that voice.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isInstrumental}
          className={`${styles.sourceModeBtn} ${isInstrumental ? styles.sourceModeBtnOn : ""}`}
          onClick={() => update({ sourceMode: "instrumental" })}
        >
          <Music size={16} style={{ color: "var(--color-gold)", marginBottom: 4 }} />
          <span className={styles.sourceModeTitle}>It&apos;s instrumental</span>
          <span className={styles.sourceModeHint}>Music only — pick a voice to lay over it.</span>
        </button>
      </div>

      <div
        className={`${styles.uploadBox} ${drag ? styles.uploadBoxDrag : ""} ${file ? styles.uploadBoxOn : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        {file ? (
          <>
            <FileAudio size={30} className={styles.uploadIcon} />
            <div className={styles.uploadFile}>{file.name}</div>
            <div className={styles.uploadMeta}>{(file.size / 1024 / 1024).toFixed(1)} MB · tap to change</div>
          </>
        ) : (
          <>
            <UploadCloud size={32} className={styles.uploadIcon} />
            <div className={styles.uploadText}>Upload your motivational audio</div>
            <div className={styles.uploadMeta}>MP3, WAV or M4A — drag &amp; drop or click to browse</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {isInstrumental && (
        <>
          <p className={styles.blockLabel}>Choose your voice</p>
          <p className={styles.sub} style={{ marginBlockStart: 0 }}>
            This voice speaks your story over your instrumental. Tap a card to hear a preview.
          </p>
          <VoicePicker
            selectedId={data.libraryVoiceId}
            onSelect={(id) => update({ libraryVoiceId: id })}
          />
        </>
      )}

      <p className={styles.disclaimer}>
        Maximum file size <strong>100 MB</strong>. Audio longer than <strong>6 minutes</strong> will be trimmed to the
        first 6 minutes.{paid ? " You get the full track, up to 6 minutes." : <> Your free preview is the first <strong>45 seconds</strong>.</>} We process your file and keep only
        the finished result — <strong>your upload is deleted right after</strong>.
      </p>
      <p className={styles.safeNote}>
        Only upload audio you own or have permission to use. RoarBliss is built for permitted audio adaptation and
        original motivational content — it preserves emotional tone and does not impersonate real people.
      </p>
    </StepShell>
  );
}
