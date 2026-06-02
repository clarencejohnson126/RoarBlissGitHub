"use client";

import React, { useState, useEffect, useRef } from "react";

interface TeaserPreviewProps {
  formData: {
    battlefield: string;
    name: string;
    family: string;
    location: string;
    struggle: string;
    champion: string;
    email?: string;
    file: File | null;
  };
  onComplete: (predictionId: string) => void;
}

const ts = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export default function TeaserPreview({ formData, onComplete }: TeaserPreviewProps) {
  const [logs, setLogs] = useState<string[]>([
    `[${ts()}] [ROAR BLISS CORE] Bootstrapping cloud personalization run…`,
  ]);
  const [loadingProgress, setLoadingProgress] = useState(4);
  const [isFailed, setIsFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();
    const ESTIMATE_S = 300; // ~5 min typical on the CPU pipeline; bar eases toward 92% over this

    const addLog = (line: string) =>
      setLogs((prev) => [...prev, `[${ts()}] ${line}`]);

    const run = async () => {
      try {
        // 1) Upload the user's audio straight to durable storage (bypasses the 4.5 MB function limit).
        let audioUrl = "";
        if (formData.file) {
          addLog(`[UPLOAD] Securing "${formData.file.name}" to the cloud…`);
          const { upload } = await import("@vercel/blob/client");
          const blob = await upload(
            `uploads/${Date.now()}-${formData.file.name}`.replace(/\s+/g, "_"),
            formData.file,
            {
              access: "public",
              handleUploadUrl: "/api/blob-upload",
              contentType: formData.file.type || "audio/mpeg",
            },
          );
          audioUrl = blob.url;
          addLog(`[UPLOAD] Source secured. Dispatching to the GPU cloud…`);
        } else {
          addLog(`[STEM SPLITTER] Using the preloaded motivational track…`);
        }

        // 2) Start the Replicate prediction (the whole pipeline).
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioUrl,
            name: formData.name,
            battlefield: formData.battlefield,
            struggle: formData.struggle,
            family: formData.family,
            location: formData.location,
            champion: formData.champion,
            email: formData.email || "",
            paid: false,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server rejected the run (${res.status}).`);
        }
        const { id } = await res.json();
        if (!id) throw new Error("No prediction id returned by the server.");
        addLog(`[QUEUE] Run accepted (${id.slice(0, 8)}…). Watching the compiler:`);

        // 3) Poll the live Replicate status + logs.
        pollInterval = setInterval(async () => {
          try {
            const sres = await fetch(`/api/process/status?id=${id}`);
            if (!sres.ok) return;
            const s = await sres.json();

            if (Array.isArray(s.logs) && s.logs.length) {
              setLogs((prev) => {
                const head = prev.slice(0, prev.findIndex((l) => l.includes("[QUEUE]")) + 1 || prev.length);
                return [...head, ...s.logs.map((l: string) => `  ${l}`)];
              });
            }

            const elapsedS = (Date.now() - startedAt) / 1000;
            setLoadingProgress(Math.min(92, 6 + (elapsedS / ESTIMATE_S) * 86));

            if (s.status === "done") {
              setLoadingProgress(100);
              if (pollInterval) clearInterval(pollInterval);
              setTimeout(() => onComplete(id), 900);
            } else if (s.status === "failed") {
              addLog(`[error] ${s.error || "Pipeline failed."}`);
              setIsFailed(true);
              if (pollInterval) clearInterval(pollInterval);
            }
          } catch (err) {
            console.error("status poll error:", err);
          }
        }, 3000);
      } catch (error: unknown) {
        console.error("personalization crashed:", error);
        addLog(`[error] ${error instanceof Error ? error.message : String(error)}`);
        addLog(`[error] Run aborted. Please check your connection and try again.`);
        setIsFailed(true);
      }
    };

    run();
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [formData, onComplete]);

  return (
    <div
      className="glass-card"
      style={{ border: isFailed ? "1px solid var(--color-crimson)" : "1px solid rgba(74, 222, 128, 0.2)" }}
    >
      <h2 className="headline-md" style={{ marginBlockEnd: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            display: "inline-block",
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: isFailed ? "var(--color-crimson)" : "#4ade80",
            boxShadow: isFailed ? "0 0 10px var(--color-crimson)" : "0 0 10px #4ade80",
          }}
        ></span>
        {isFailed ? (
          <>Pipeline <span className="text-highlight-crimson">Aborted</span></>
        ) : (
          <>Surgically Grafting Your <span className="text-highlight-crimson">Ego-Track</span></>
        )}
      </h2>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem", marginBlockEnd: "1.5rem", lineHeight: "1.4" }}>
        {isFailed
          ? "The cloud run didn't complete. Check your connection or try again with different audio."
          : "Our scale-to-zero GPU cloud is splitting stems, scanning tension valleys, cloning the speaker's voice, and level-mixing the final track. Watch the compiler run:"}
      </p>

      <div className="terminal-box" style={{ minHeight: "220px" }}>
        {logs.map((log, index) => {
          if (!log) return null;
          const isError = /\[error\]/i.test(log) || /crash|failed/i.test(log);
          const isSuccess = log.includes("ready") || log.includes("[QUEUE]");
          return (
            <div
              key={index}
              className={`terminal-line ${isError ? "error" : ""} ${isSuccess ? "success" : ""}`}
              style={{ animationDelay: `${index * 50}ms`, opacity: 1, transform: "none" }}
            >
              {log}
            </div>
          );
        })}
        <div
          className="terminal-loading-bar"
          style={{
            width: `${loadingProgress}%`,
            background: isFailed ? "var(--color-crimson)" : "linear-gradient(to right, var(--color-crimson), var(--color-gold))",
          }}
        ></div>
      </div>
      <div style={{ marginBlockStart: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
        <span>Engine: Replicate scale-to-zero cloud</span>
        <span>Pipeline: Demucs · Whisper · pyannote · Sonnet · TTS</span>
      </div>
    </div>
  );
}
