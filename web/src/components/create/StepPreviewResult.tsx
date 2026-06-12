"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import AudioVisualizer from "@/components/AudioVisualizer";
import { useCreateFlow } from "./CreateFlowProvider";
import { composePayload } from "./createData";
import styles from "./create.module.css";

export default function StepPreviewResult() {
  const { data, sessionId, setStep, reset } = useCreateFlow();
  const p = composePayload(data);
  const firstName = (data.userName || "").trim().split(" ")[0] || "warrior";
  const [copied, setCopied] = useState(false);

  // sessionId is the finished prediction id — its public share page is /t/<id>.
  const share = async () => {
    if (!sessionId) return;
    const url = `${window.location.origin}/t/${sessionId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Roar Bliss", text: "My battle speech — made for me, in the original voice.", url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formData = {
    battlefield: p.battlefield,
    name: p.name,
    family: p.family,
    location: "",
    struggle: p.struggle,
    champion: p.champion,
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/bliss/bliss-caring.png" alt="" className={styles.bgImg} />
        <div className={styles.bgScrim} />
      </div>

      <div className={styles.stage}>
        <motion.div
          className={styles.inner}
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className={styles.eyebrow}>Your first roar</span>
          <h1 className={styles.headline}>
            Your first roar is <span className={styles.gold}>ready.</span>
          </h1>
          <p className={styles.sub}>Listen to your 45-second preview, {firstName}. Create an account to download the full track.</p>

          <div style={{ marginBlockStart: "2rem" }}>
            <AudioVisualizer formData={formData} sessionId={sessionId} />
          </div>

          <div className={styles.nav} style={{ justifyContent: "center", flexWrap: "wrap" }}>
            {sessionId && (
              <button type="button" className={styles.btnGold} onClick={share}>
                {copied ? "Link copied ✓" : "Share my roar"}
              </button>
            )}
            <Link href="/community" className={styles.btnGhost} style={{ textDecoration: "none" }}>
              Post it on the wall
            </Link>
            <button type="button" className={styles.btnGhost} onClick={() => setStep(5)}>
              Edit my story
            </button>
            <button type="button" className={styles.btnGhost} onClick={reset}>
              Start a new speech
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
