"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import ChapterSection from "./ChapterSection";
import CinematicVideo from "./CinematicVideo";
import RevealText from "./RevealText";
import { PLAN } from "./content";
import styles from "./story.module.css";

export default function ProcessTimeline() {
  const reduced = useReducedMotion();
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

      {/* 60-second explainer (Remotion: animated walkthrough + VO) */}
      <div className={styles.demoVideoWrap}>
        <video
          className={styles.demoVideo}
          src="/how-it-works.mp4"
          poster="/how-it-works-poster.jpg"
          controls
          preload="none"
          playsInline
        />
      </div>

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
  );
}
