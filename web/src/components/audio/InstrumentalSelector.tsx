"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Check, Pause, Play, Upload } from "lucide-react";
import ChapterSection from "@/components/story/ChapterSection";
import RevealText from "@/components/story/RevealText";
import { SOUND } from "@/components/story/content";
import { INSTRUMENTALS } from "@/data/instrumentals";
import { useAudio } from "./CinematicAudioProvider";
import storyStyles from "@/components/story/story.module.css";
import styles from "./audio.module.css";

export default function InstrumentalSelector() {
  const { selectedId, currentId, playing, selectTrack, playTrack } = useAudio();
  const reduced = useReducedMotion();

  const grid: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.07 } } };
  const card: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <ChapterSection id="chapter-sound" scrim="soft" full={false}>
      <span className={storyStyles.eyebrow}>{SOUND.eyebrow}</span>
      <RevealText as="h2" text={SOUND.heading} className={storyStyles.headlineHuge} />
      <p className={storyStyles.lead}>{SOUND.sub}</p>

      <motion.div
        className={styles.soundGrid}
        variants={grid}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
      >
        {INSTRUMENTALS.map((t) => {
          const isSelected = selectedId === t.id;
          const isPlaying = currentId === t.id && playing;
          return (
            <motion.div
              key={t.id}
              className={`${styles.soundCard} ${isSelected ? styles.soundCardSelected : ""}`}
              variants={card}
            >
              <div className={styles.soundHead}>
                <div>
                  <div className={styles.soundTitle}>{t.title}</div>
                  <div className={styles.soundMood}>{t.mood}</div>
                </div>
                <span className={`${styles.intensity} ${t.intensity === "epic" ? styles.intensityEpic : ""}`}>
                  {t.intensity}
                </span>
              </div>

              <div className={styles.recFor}>
                {t.recommendedFor.map((r) => (
                  <span key={r} className={styles.recTag}>
                    {r}
                  </span>
                ))}
              </div>

              <div className={styles.cardActions}>
                <button className={styles.previewBtn} onClick={() => playTrack(t.id)} aria-label={`Preview ${t.title}`}>
                  {isPlaying ? (
                    <>
                      <Pause size={14} /> Playing
                    </>
                  ) : (
                    <>
                      <Play size={14} /> Preview
                    </>
                  )}
                </button>
                <button
                  className={`${styles.selectBtn} ${isSelected ? styles.selectBtnActive : ""}`}
                  onClick={() => selectTrack(t.id)}
                >
                  {isSelected ? "Selected" : "Select"}
                </button>
              </div>

              {isSelected && (
                <span className={styles.selectedTag}>
                  <Check size={13} /> {SOUND.selectedLabel}
                </span>
              )}
            </motion.div>
          );
        })}

        {/* upload-your-own placeholder (TODO: wire to /api/blob-upload) */}
        <motion.div className={`${styles.soundCard} ${styles.uploadCard}`} variants={card}>
          <Upload size={22} color="var(--color-gold)" aria-hidden />
          <div className={styles.soundTitle}>{SOUND.upload.title}</div>
          <div className={styles.soundMood}>{SOUND.upload.desc}</div>
          <button className={styles.uploadBtn} disabled title="Upload coming soon">
            {SOUND.upload.button}
          </button>
        </motion.div>
      </motion.div>
    </ChapterSection>
  );
}
