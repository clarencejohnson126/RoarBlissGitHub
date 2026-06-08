"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import ChapterSection from "./ChapterSection";
import CinematicVideo from "./CinematicVideo";
import RevealText from "./RevealText";
import { BATTLE } from "./content";
import styles from "./story.module.css";

export default function BattleCards() {
  const reduced = useReducedMotion();
  const grid: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : 0.06 } },
  };
  const card: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  };

  // cursor-driven 3D tilt + spotlight (sets CSS vars for the radial glow)
  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (reduced) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * 8}deg) rotateY(${(px - 0.5) * 8}deg) translateY(-5px)`;
  };
  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.transform = "";
  };

  return (
    <ChapterSection
      id="chapter-03"
      scrim="bottom"
      full={false}
      background={
        <CinematicVideo
          src="/images/bliss/bliss-training.mp4"
          poster="/images/bliss/bliss-training.png"
          alt="Sparring practice in a misty forest — growth, not just battle"
          objectPosition="center center"
        />
      }
    >
      <span className={styles.eyebrow}>{BATTLE.eyebrow}</span>
      <RevealText as="h2" text={BATTLE.heading} className={styles.headlineHuge} />
      <p className={styles.lead}>{BATTLE.sub}</p>

      <motion.div
        className={`${styles.cardGrid} ${styles.tiltGrid}`}
        variants={grid}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {BATTLE.templates.map((t) => (
          <motion.div key={t.title} variants={card}>
            <Link href="/create" className={styles.card} onMouseMove={onMove} onMouseLeave={onLeave}>
              <span className={styles.cardTitle}>
                {t.title}
                <ArrowRight size={18} />
              </span>
              <span className={styles.cardDesc}>{t.desc}</span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </ChapterSection>
  );
}
