"use client";

import { MARQUEE } from "./content";
import styles from "./story.module.css";

/** Looping band of battle words. Track holds two copies so the -50% loop is seamless. */
export default function Marquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className={styles.marquee} aria-hidden>
      <div className={styles.marqueeTrack}>
        {items.map((word, i) => (
          <span key={i} className={styles.marqueeItem}>
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}
