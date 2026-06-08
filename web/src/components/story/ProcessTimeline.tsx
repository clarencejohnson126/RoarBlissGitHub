"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Play, X } from "lucide-react";
import { useAudio } from "@/components/audio/CinematicAudioProvider";
import ChapterSection from "./ChapterSection";
import CinematicVideo from "./CinematicVideo";
import RevealText from "./RevealText";
import { PLAN } from "./content";
import styles from "./story.module.css";

export default function ProcessTimeline() {
  const reduced = useReducedMotion();
  const [videoOpen, setVideoOpen] = useState(false);
  const { muted, toggleMute } = useAudio();
  const mutedByVideoRef = useRef(false);

  const openVideo = () => {
    if (!muted) {
      toggleMute(); // duck the ambient track so the explainer isn't fighting it
      mutedByVideoRef.current = true;
    }
    setVideoOpen(true);
  };
  const closeVideo = () => {
    setVideoOpen(false);
    if (mutedByVideoRef.current) {
      toggleMute();
      mutedByVideoRef.current = false;
    }
  };

  useEffect(() => {
    if (!videoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setVideoOpen(false);
      if (mutedByVideoRef.current) {
        toggleMute();
        mutedByVideoRef.current = false;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoOpen, toggleMute]);

  const list: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : 0.18 } },
  };
  const step: Variants = {
    hidden: reduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -28 },
    show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
  };
  const rail: Variants = {
    hidden: reduced ? { scaleY: 1 } : { scaleY: 0 },
    show: { scaleY: 1, transition: { duration: 1.2, ease: "easeInOut" } },
  };

  return (
    <>
      <ChapterSection
        id="chapter-04"
        scrim="bottom"
        full={false}
        background={
          <CinematicVideo
            src="/images/bliss/bliss-plans.mp4"
            poster="/images/bliss/bliss-plans.png"
            alt="A man studying building plans by lantern light at a wooden table"
            objectPosition="center center"
          />
        }
      >
        <span className={styles.eyebrow}>{PLAN.eyebrow}</span>
        <RevealText as="h2" text={PLAN.heading} className={styles.headlineHuge} />
        <p className={styles.lead}>{PLAN.sub}</p>

        {/* opens the 60-second explainer in an overlay (keeps the animated background visible) */}
        <button type="button" className={styles.watchVideoBtn} onClick={openVideo}>
          <span className={styles.watchVideoIcon}><Play size={16} fill="currentColor" /></span>
          Watch the tutorial here
        </button>

        <motion.div
          className={styles.timeline}
          variants={list}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.div className={styles.timelineRail} variants={rail} />
          {PLAN.steps.map((s) => (
            <motion.div key={s.n} className={styles.step} variants={step}>
              <div className={styles.stepNum}>{s.n}</div>
              <div className={styles.stepTitle}>{s.title}</div>
              <div className={styles.stepDesc}>{s.desc}</div>
            </motion.div>
          ))}
        </motion.div>
      </ChapterSection>

      {videoOpen && (
        <div className={styles.videoModalBackdrop} onClick={closeVideo} role="dialog" aria-modal="true" aria-label="How it works video">
          <div className={styles.videoModalInner} onClick={(e) => e.stopPropagation()}>
            <button className={styles.videoModalClose} onClick={closeVideo} aria-label="Close video">
              <X size={22} />
            </button>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video className={styles.videoModalVideo} src="/how-it-works.mp4" poster="/how-it-works-poster.jpg" controls autoPlay playsInline />
          </div>
        </div>
      )}
    </>
  );
}
