"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  const { data, file, presetAudioUrl, saveVoice, setSessionId, setStep, entitlement } = useCreateFlow();
  const paid = !!entitlement?.tier;
  // Same length as PHASES (the poll logic keys off PHASES.length) — only the last label is tier-aware.
  const phaseLabels = paid ? [...PHASES.slice(0, -1), "Preparing your track"] : PHASES;
  const [progress, setProgress] = useState(4);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState(false);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);  // free-limit reached → show an Upgrade CTA
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
        // 1) upload audio to durable storage — or reuse a saved voice (no upload needed)
        let audioUrl = presetAudioUrl || "";
        if (file && !audioUrl) {
          const { upload } = await import("@vercel/blob/client");
          const blob = await upload(
            `uploads/${Date.now()}-${file.name}`.replace(/\s+/g, "_"),
            file,
            { access: "public", handleUploadUrl: "/api/blob-upload", contentType: file.type || "audio/mpeg" },
          );
          audioUrl = blob.url;
        }

        // Measure the runtime so paid runs bill by minutes (capped at 6 min server-side). Works for BOTH
        // a fresh upload (object URL) AND a saved voice (remote blob URL) — without the saved-voice case
        // durationSec stayed 0 and the server defaulted to the full 6-min cap, over-billing a short clip.
        // (Reading .duration via loadedmetadata needs no CORS; a failed read falls back to 0 → 6-min cap.)
        let durationSec = 0;
        const objectUrl = file ? URL.createObjectURL(file) : "";
        const measureSrc = objectUrl || audioUrl;
        if (measureSrc) {
          durationSec = await new Promise<number>((resolve) => {
            let settled = false;
            const done = (d: number) => {
              if (settled) return;
              settled = true;
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              resolve(Number.isFinite(d) && d > 0 ? d : 0);
            };
            // A remote (saved-voice) blob URL can stall; never let metadata reading block the run from
            // starting — on timeout we fall back to 0 (server applies the 6-min cap), same as a failed read.
            const timer = setTimeout(() => done(0), 8000);
            try {
              const a = document.createElement("audio");
              a.preload = "metadata";
              a.onloadedmetadata = () => { clearTimeout(timer); done(a.duration); };
              a.onerror = () => { clearTimeout(timer); done(0); };
              a.src = measureSrc;
            } catch {
              clearTimeout(timer);
              done(0);
            }
          });
        }

        // 2) start the run (attach token for paid; free is device/IP gated)
        const { data: sess } = await supabaseBrowser().auth.getSession();
        const token = sess.session?.access_token;

        // Voice favorite (opt-in): copy the upload into the user's library BEFORE the post-run
        // cleanup deletes it. Best-effort — a failed save never blocks the generation.
        if (saveVoice && token && audioUrl && !presetAudioUrl) {
          fetch("/api/voices", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ audioUrl, name: file?.name?.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "My voice" }),
          }).catch(() => {});
        }
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
          body: JSON.stringify({ audioUrl, ...composePayload(data), email: "", deviceId, durationSec }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          if (e.freeLimitReached) { setNeedsUpgrade(true); throw new Error("Your free preview is used up — one per device. Pick a plan to create full tracks (up to 6 minutes) every month."); }
          if (e.budgetReached) throw new Error("We've hit today's capacity. Please try again a little later — we'll be back shortly.");
          if (e.userLimitReached) throw new Error("You've reached today's limit on this device. Please come back tomorrow.");
          throw new Error(e.error || `The server rejected the run (${res.status}).`);
        }
        const resp = await res.json();

        // remember this setup so a returning, signed-in user lands straight in Quick Create next time
        if (token) {
          const profile: Record<string, unknown> = {
            nickname: data.userName,
            battles: data.selectedBattles,
            tone: data.primaryTone,
            language: data.language,
            secondaryTone: data.secondaryTone,
            intensity: data.intensity,
            depth: data.personalizationDepth,
          };
          // Only persist narrative fields when present THIS session. QuickCreate no longer pre-fills them
          // (precedence fix), so sending empty arrays here would wipe a returning user's saved profile —
          // the /api/profile deep-merge keeps omitted keys. The full wizard sets them, so they save there.
          if (data.reasonForFighting.length) {
            profile.reasonForFighting = data.reasonForFighting;
            profile.people = data.reasonForFighting.join(", ");
          }
          if (data.neededEmotions.length) profile.neededEmotions = data.neededEmotions;
          if (data.lifePressure.length) profile.lifePressure = data.lifePressure;
          fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ profile }),
          }).catch(() => {});
        }

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
              setError(
                (s.error ? s.error + " " : "") +
                  "You weren't charged — no minutes were used (you only pay for finished tracks). Try again with the same or different audio.",
              );
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
                {phaseLabels.map((p, i) => {
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
              <div className={styles.nav} style={{ justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                {needsUpgrade && (
                  <Link href="/pricing" className={styles.btnGold}>See plans &amp; upgrade</Link>
                )}
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
