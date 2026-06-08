"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import ChapterSection from "./ChapterSection";
import RevealText from "./RevealText";
import { DEPTH } from "./content";
import styles from "./story.module.css";

function DepthNumber({ pct }: { pct: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const numeric = /^\d+/.test(pct);
  const target = numeric ? parseInt(pct, 10) : 0;
  const [val, setVal] = useState(numeric ? 0 : pct);

  useEffect(() => {
    if (!numeric || !inView) return;
    if (reduced) {
      setVal(`${target}%`);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(`${Math.round(v)}%`),
    });
    return () => controls.stop();
  }, [inView, numeric, target, reduced]);

  return (
    <span ref={ref} className={styles.depthNum}>
      {numeric ? val : pct}
    </span>
  );
}

export default function DepthScale() {
  const reduced = useReducedMotion();
  const grid: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.12 } } };
  const item: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  };
  const bar: Variants = {
    hidden: reduced ? { scaleX: 1 } : { scaleX: 0 },
    show: { scaleX: 1, transition: { duration: 1, ease: [0.16, 1, 0.3, 1] } },
  };

  const pctWidth = (p: string) => (/^\d+/.test(p) ? `${parseInt(p, 10)}%` : "100%");

  return (
    <ChapterSection id="chapter-05" scrim="soft" full={false}>
      <span className={styles.eyebrow}>{DEPTH.eyebrow}</span>
      <RevealText as="h2" text={DEPTH.heading} className={styles.headlineHuge} />

      <motion.div
        className={styles.depthGrid}
        variants={grid}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {DEPTH.levels.map((lvl) => (
          <motion.div key={lvl.pct} className={styles.depthItem} variants={item}>
            <DepthNumber pct={lvl.pct} />
            <div className={styles.depthBarWrap}>
              <motion.div className={styles.depthBar} style={{ width: pctWidth(lvl.pct) }} variants={bar} />
            </div>
            <div className={styles.depthTitle}>{lvl.title}</div>
            <div className={styles.depthDesc}>{lvl.desc}</div>
          </motion.div>
        ))}
      </motion.div>
    </ChapterSection>
  );
}
