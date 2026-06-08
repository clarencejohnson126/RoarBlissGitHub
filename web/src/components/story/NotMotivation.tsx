"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import ChapterSection from "./ChapterSection";
import { WHY } from "./content";
import styles from "./story.module.css";

export default function NotMotivation() {
  const reduced = useReducedMotion();
  const preWords = WHY.pre.trim().split(" ");
  const goldWords = WHY.gold.trim().split(" ");

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : 0.1 } },
  };
  // each word brightens from dim to full as it staggers in
  const word: Variants = {
    hidden: reduced ? { opacity: 1 } : { opacity: 0.15 },
    show: { opacity: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <ChapterSection id="chapter-07" scrim="soft" center>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        style={{ textAlign: "center", maxWidth: 1000, marginInline: "auto" }}
      >
        <span className={styles.eyebrow}>{WHY.eyebrow}</span>
        <p className={styles.whyQuote} style={{ maxWidth: "20ch", marginInline: "auto" }}>
          {preWords.map((w, i) => (
            <motion.span key={`p${i}`} variants={word} style={{ display: "inline-block", marginRight: "0.28em" }}>
              {w}
            </motion.span>
          ))}
          {goldWords.map((w, i) => (
            <motion.span
              key={`g${i}`}
              variants={word}
              className={styles.goldItalic}
              style={{ display: "inline-block", marginRight: "0.28em" }}
            >
              {w}
            </motion.span>
          ))}
        </p>
        <motion.p variants={word} className={styles.body} style={{ marginInline: "auto", marginBlockStart: "2rem" }}>
          {WHY.sub}
        </motion.p>
      </motion.div>
    </ChapterSection>
  );
}
