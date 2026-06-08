"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileAudio } from "lucide-react";
import { useCreateFlow } from "./CreateFlowProvider";
import StepShell from "./StepShell";
import styles from "./create.module.css";

export default function StepAudioUpload() {
  const { file, setFile, next } = useCreateFlow();
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      sub="Now bring the voice. RoarBliss reshapes it around your story while preserving the emotional tone and music."
      onNext={() => file && next()}
      nextDisabled={!file}
      nextLabel="Generate Preview"
    >
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

      <p className={styles.disclaimer}>
        Maximum file size <strong>100 MB</strong>. Audio longer than <strong>6 minutes</strong> will be trimmed to the
        first 6 minutes. Your free preview is the first <strong>45 seconds</strong>.
      </p>
      <p className={styles.safeNote}>
        Only upload audio you own or have permission to use. RoarBliss is built for permitted audio adaptation and
        original motivational content — it preserves emotional tone and does not impersonate real people.
      </p>
    </StepShell>
  );
}
