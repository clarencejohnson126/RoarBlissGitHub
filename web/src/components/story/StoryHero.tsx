"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type Lenis from "lenis";
import ChapterSection from "./ChapterSection";
import CinematicVideo from "./CinematicVideo";
import MagneticButton from "./MagneticButton";
import { HERO } from "./content";
import styles from "./story.module.css";

export default function StoryHero() {
  const reduced = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : 0.18, delayChildren: 0.2 } },
  };
  const line: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] } },
  };
  const fade: Variants = {
    hidden: reduced ? { opacity: 1 } : { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, delay: reduced ? 0 : 0.95, ease: [0.16, 1, 0.3, 1] } },
  };

  const toPlan = () => {
    const el = document.querySelector("#chapter-04");
    const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
    if (el && lenis) lenis.scrollTo(el as HTMLElement);
    else el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <ChapterSection
      id="chapter-00"
      scrim="left"
      className={styles.hero}
      background={
        <CinematicVideo
          src="/images/story/hero-warrior.mp4"
          poster="/images/story/hero-warrior.png"
          alt="A weathered warrior before a vast battlefield; a snarling lion lunges to attack"
          objectPosition="center center"
          once
        />
      }
    >
      <motion.span className={styles.eyebrow} variants={fade} initial="hidden" animate="show">
        {HERO.eyebrow}
      </motion.span>

      <motion.h1 className={styles.heroLines} variants={container} initial="hidden" animate="show">
        {HERO.lines.map((l, i) => (
          <motion.span
            key={l}
            className={`${styles.heroLine} ${i === HERO.lines.length - 1 ? styles.gold : ""}`}
            style={i === HERO.lines.length - 1 ? { fontStyle: "italic" } : undefined}
            variants={line}
          >
            {l}
          </motion.span>
        ))}
      </motion.h1>

      <motion.p className={styles.heroSub} variants={fade} initial="hidden" animate="show">
        {HERO.sub}
      </motion.p>

      <motion.div className={styles.btnRow} variants={fade} initial="hidden" animate="show">
        <MagneticButton>
          <Link href={HERO.primary.href} className={styles.btnGold}>
            {HERO.primary.label}
          </Link>
        </MagneticButton>
        <MagneticButton>
          <button type="button" className={styles.btnGhost} onClick={toPlan}>
            {HERO.secondary.label}
          </button>
        </MagneticButton>
      </motion.div>

      <button type="button" className={styles.scrollHint} onClick={toPlan} aria-label="Scroll to how it works">
        Scroll
        <ChevronDown size={18} />
      </button>
    </ChapterSection>
  );
}
