"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useCreateFlow } from "./CreateFlowProvider";
import { composePayload } from "./createData";
import styles from "./create.module.css";

const PHASES = [
  "Reading your story",
  "Finding the emotional tone",
  "Rewriting the speech for your life",
  "Blending your battle into the words",
  "Preparing your preview",
];

export default function StepGenerating() {
  const { data, file, setSessionId, setStep } = useCreateFlow();
  const [progress, setProgress] = useState(4);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState(false);
  const started = useRef(false);
  const firstName = (data.userName || "").trim().split(" ")[0] || "warrior";

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let poll: ReturnType<typeof setInterval> | null = null;
    const t0 = Date.now();
    const EST = 300;

    const run = async () => {
      try {
        // 1) upload audio to durable storage
        let audioUrl = "";
        if (file) {
          const { upload } = await import("@vercel/blob/client");
          const blob = await upload(
            `uploads/${Date.now()}-${file.name}`.replace(/\s+/g, "_"),
            file,
            { access: "public", handleUploadUrl: "/api/blob-upload", contentType: file.type || "audio/mpeg" },
          );
          audioUrl = blob.url;
        }

        // 2) start the run (attach token for paid; free is device/IP gated)
        const { data: sess } = await supabaseBrowser().auth.getSession();
        const token = sess.session?.access_token;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        let deviceId = "";
        try {
          deviceId = localStorage.getItem("rb_device") || "";
          if (!deviceId) {
            deviceId = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
            localStorage.setItem("rb_device", deviceId);
          }
        } catch {
          /* private mode → IP-only gating */
        }

        const res = await fetch("/api/process", {
          method: "POST",
          headers,
          body: JSON.stringify({ audioUrl, ...composePayload(data), email: "", deviceId }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          if (e.freeLimitReached) throw new Error("Your free preview is used up (one per device). Create an account to make more.");
          if (e.budgetReached) throw new Error("We've hit today's capacity. Please try again a little later — we'll be back shortly.");
          if (e.userLimitReached) throw new Error("You've reached today's limit on this device. Please come back tomorrow.");
          throw new Error(e.error || `The server rejected the run (${res.status}).`);
        }
        const resp = await res.json();
        const id = resp.id;
        const jobFlag = resp.queued ? "&job=1" : ""; // queued → poll by job id until a slot frees
        if (resp.queued) setQueued(true);
        if (!id) throw new Error("No prediction id returned.");

        // 3) poll
        poll = setInterval(async () => {
          try {
            const sres = await fetch(`/api/process/status?id=${id}${jobFlag}`);
            if (!sres.ok) return;
            const s = await sres.json();
            setQueued(Boolean(s.queued));
            const elapsed = (Date.now() - t0) / 1000;
            const p = s.queued ? 5 : Math.min(95, 6 + (elapsed / EST) * 89);
            setProgress(p);
            setPhase(Math.min(PHASES.length - 1, Math.floor((p / 100) * PHASES.length)));
            if (s.status === "done") {
              if (poll) clearInterval(poll);
              setProgress(100);
              setPhase(PHASES.length);
              setTimeout(() => {
                setSessionId(s.id || id);
                setStep(7);
              }, 800);
            } else if (s.status === "failed") {
              if (poll) clearInterval(poll);
              setError(s.error || "The pipeline failed. Try again with different audio.");
            }
          } catch {
            /* keep polling */
          }
        }, 3000);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    };

    run();
    return () => {
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/story/closeup-warrior.png" alt="" className={styles.bgImg} />
        <div className={styles.bgScrim} />
      </div>

      <div className={styles.stage} style={{ justifyContent: "center" }}>
        <div className={`${styles.inner} ${styles.loader}`}>
          {!error ? (
            <>
              <div className={styles.loaderBars} aria-hidden>
                {Array.from({ length: 7 }).map((_, i) => (
                  <span key={i} className={styles.loaderBar} style={{ animationDelay: `${i * 0.11}s` }} />
                ))}
              </div>
              <h1 className={styles.headline}>
                Forging your speech, <span className={styles.gold}>{firstName}.</span>
              </h1>
              <p className={styles.sub} style={{ marginInline: "auto" }}>
                {queued
                  ? "You're in the queue — demand is high right now. Your run starts the moment a slot frees up, and we'll email you the second it's ready."
                  : "Your story is being turned into a voice that pulls you forward."}
              </p>

              <div className={styles.phases}>
                {PHASES.map((p, i) => {
                  const done = i < phase;
                  const on = i === phase;
                  return (
                    <div key={p} className={`${styles.phase} ${on ? styles.phaseOn : ""} ${done ? styles.phaseDone : ""}`}>
                      <span className={styles.phaseTick}>
                        {done ? <Check size={16} /> : on ? <Loader2 size={16} className={styles.spin} /> : "·"}
                      </span>
                      {p}
                    </div>
                  );
                })}
              </div>

              <div className={styles.loaderBarTrack}>
                <div className={styles.loaderBarFill} style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              <h1 className={styles.headline}>We hit a snag.</h1>
              <p className={styles.sub} style={{ marginInline: "auto" }}>
                {error}
              </p>
              <div className={styles.nav} style={{ justifyContent: "center" }}>
                <button type="button" className={styles.btnGhost} onClick={() => setStep(5)}>
                  Edit my story
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
