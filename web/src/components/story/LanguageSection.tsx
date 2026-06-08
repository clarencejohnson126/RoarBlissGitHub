"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import ChapterSection from "./ChapterSection";
import CinematicImage from "./CinematicImage";
import RevealText from "./RevealText";
import { LANGUAGE } from "./content";
import styles from "./story.module.css";

const WAVE = Array.from({ length: 40 });

export default function LanguageSection() {
  const reduced = useReducedMotion();
  const wrap: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.05 } } };
  const pill: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <ChapterSection
      id="chapter-06"
      scrim="bottom"
      background={
        <CinematicImage
          src="/images/bliss/bliss-terrace.png"
          alt="A cliff-top stone terrace with a Roar Bliss banner, overlooking a river valley at golden hour"
          parallax={12}
          objectPosition="center center"
        />
      }
    >
      <span className={styles.eyebrow}>{LANGUAGE.eyebrow}</span>
      <RevealText as="h2" text={LANGUAGE.heading} splitBy="word" className={styles.headline} style={{ maxWidth: "24ch" }} />
      <p className={styles.body}>{LANGUAGE.sub}</p>

      <motion.div
        className={styles.langGrid}
        variants={wrap}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        {LANGUAGE.langs.map((l) => (
          <motion.span key={l} className={styles.pill} variants={pill}>
            {l}
          </motion.span>
        ))}
      </motion.div>

      <div className={styles.waveform} aria-hidden>
        {WAVE.map((_, i) => (
          <span
            key={i}
            className={styles.waveBar}
            style={{ animationDelay: `${(i % 20) * 0.06}s`, animationDuration: `${1 + (i % 5) * 0.18}s` }}
          />
        ))}
      </div>
    </ChapterSection>
  );
}
