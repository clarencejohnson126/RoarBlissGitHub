"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useAudio } from "./CinematicAudioProvider";
import styles from "./audio.module.css";

/** Autoplay-safe cinematic intro: the user's click is the gesture that unlocks audio.
 *  Only shown on /story (the cinematic entry) — never on the landing or /create. */
export default function AudioUnlockOverlay() {
  const { unlocked, unlock } = useAudio();
  const pathname = usePathname();
  const onStory = pathname === "/story";

  return (
    <AnimatePresence>
      {!unlocked && onStory && (
        <motion.div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Enter the experience"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.overlayInner}>
            <div className={`${styles.overlayBars} ${styles.barsPlaying}`} aria-hidden>
              {Array.from({ length: 7 }).map((_, i) => (
                <span key={i} className={styles.bar} style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
            <h2 className={styles.overlayTitle}>Enter the experience</h2>
            <p className={styles.overlaySub}>Roar Bliss is built to be heard.</p>
            <div className={styles.overlayBtns}>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <button className={styles.btnGold} onClick={() => unlock(true)} autoFocus>
                Start with sound
              </button>
              <button className={styles.btnGhost} onClick={() => unlock(false)}>
                Continue muted
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
