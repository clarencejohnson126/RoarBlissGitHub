"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import ChapterSection from "./ChapterSection";
import RevealText from "./RevealText";
import { TESTIMONIALS } from "./content";
import styles from "./story.module.css";

export default function Testimonials() {
  const reduced = useReducedMotion();
  const grid: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.12 } } };
  const card: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <ChapterSection id="chapter-testimonials" scrim="soft" full={false}>
      <span className={styles.eyebrow}>{TESTIMONIALS.eyebrow}</span>
      <RevealText as="h2" text={TESTIMONIALS.heading} className={styles.headlineHuge} />

      <motion.div
        className={styles.testiGrid}
        variants={grid}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {TESTIMONIALS.items.map((t) => (
          <motion.div key={t.name} className={styles.testiCard} variants={card}>
            <div className={styles.testiStars} aria-label="5 out of 5">★★★★★</div>
            <p className={styles.testiQuote}>&ldquo;{t.quote}&rdquo;</p>
            <div className={styles.testiWho}>
              <div className={styles.testiName}>{t.name}</div>
              <div className={styles.testiRole}>{t.role}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </ChapterSection>
  );
}
