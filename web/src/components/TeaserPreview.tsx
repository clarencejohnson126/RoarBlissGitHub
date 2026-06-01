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
  onComplete: (sessionId: string) => void;
}

export default function TeaserPreview({ formData, onComplete }: TeaserPreviewProps) {
  const [logs, setLogs] = useState<string[]>(["[00:00:00] [ROAR BLISS CORE] Bootstrapping client controller..."]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isFailed, setIsFailed] = useState(false);
  const sessionStartedRef = useRef(false);

  useEffect(() => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    let pollInterval: NodeJS.Timeout | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;

    const startAudioProcessing = async () => {
      try {
        const bodyFormData = new FormData();
        bodyFormData.append("name", formData.name);
        bodyFormData.append("battlefield", formData.battlefield);
        bodyFormData.append("struggle", formData.struggle);
        bodyFormData.append("family", formData.family);
        bodyFormData.append("location", formData.location);
        bodyFormData.append("champion", formData.champion);
        if (formData.email) {
          bodyFormData.append("email", formData.email);
        }

        if (formData.file) {
          bodyFormData.append("file", formData.file);
        }

        const response = await fetch("/api/process", {
          method: "POST",
          body: bodyFormData,
        });

        if (!response.ok) {
          throw new Error("API route rejected audio compilation initialization.");
        }

        const resData = await response.json();
        const sessionId = resData.sessionId;

        if (!sessionId) {
          throw new Error("No Session ID returned by server.");
        }

        // Poll logs
        pollInterval = setInterval(async () => {
          try {
            const logsRes = await fetch(`/api/logs?sessionId=${sessionId}`);
            if (!logsRes.ok) return;
            const logsData = await logsRes.json();
            
            if (logsData.logs && logsData.logs.length > 0) {
              setLogs(logsData.logs);
              
              // Calculate progress based on steps
              const totalLines = logsData.logs.length;
              const hasSuccess = logsData.logs.some((line: string) => line.includes("[SUCCESS]"));
              // Pipeline emits "[ERROR]" (uppercase); the API route emits "[error]".
              // Match both so real failures surface instead of spinning forever at 92%.
              const hasError = logsData.logs.some((line: string) => /\[error\]/i.test(line));

              if (hasError) {
                setIsFailed(true);
                if (pollInterval) clearInterval(pollInterval);
                return;
              }

              if (hasSuccess) {
                setLoadingProgress(100);
                if (pollInterval) clearInterval(pollInterval);
                
                // Complete session after a short dramatic pause
                setTimeout(() => {
                  onComplete(sessionId);
                }, 1200);
              } else {
                // Increment loading progress smoothly up to 92%
                setLoadingProgress(Math.min(totalLines * 7.5, 92));
              }
            }
          } catch (err) {
            console.error("Error polling logs:", err);
          }
        }, 500);

      } catch (error: unknown) {
        console.error("Audio personalization process crashed:", error);
        setLogs((prev) => [
          ...prev,
          `[error] Critical error during transmission: ${error instanceof Error ? error.message : String(error)}`,
          `[error] Personalization aborted. Please check connection and try again.`
        ]);
        setIsFailed(true);
      }
    };

    startAudioProcessing();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [formData, onComplete]);

  return (
    <div className="glass-card" style={{ border: isFailed ? "1px solid var(--color-crimson)" : "1px solid rgba(74, 222, 128, 0.2)" }}>
      <h2 className="headline-md" style={{ marginBlockEnd: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span 
          className="text-highlight-gold" 
          style={{ 
            display: "inline-block", 
            width: "10px", 
            height: "10px", 
            borderRadius: "50%", 
            background: isFailed ? "var(--color-crimson)" : "#4ade80", 
            boxShadow: isFailed ? "0 0 10px var(--color-crimson)" : "0 0 10px #4ade80" 
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
          ? "The local stem separation and speech alignment encountered a compilation crash. Check server.py status." 
          : "Our GPU cluster is splitting stems, scanning tension valleys, cloning the Mentor's voice, and level-mixing the final track. Watch the compiler run:"
        }
      </p>

      <div className="terminal-box" style={{ minHeight: "220px" }}>
        {logs.map((log, index) => {
          if (!log) return null;
          const isError = log.includes("[error]") || log.includes("crash") || log.includes("failed");
          const isSuccess = log.includes("[SUCCESS]");
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
            background: isFailed ? "var(--color-crimson)" : "linear-gradient(to right, var(--color-crimson), var(--color-gold))"
          }}
        ></div>
      </div>
      <div style={{ marginBlockStart: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
        <span>Engine: Antigravity Local AI Core</span>
        <span>Allocated: Port 7860 Cloner</span>
      </div>
    </div>
  );
}
