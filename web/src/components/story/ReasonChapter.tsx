"use client";

import Image from "next/image";
import ChapterSection from "./ChapterSection";
import CinematicVideo from "./CinematicVideo";
import RevealText from "./RevealText";
import { REASON } from "./content";
import styles from "./story.module.css";

export default function ReasonChapter() {
  return (
    <>
      {/* 02 — push-ups with daughter (the WHY): warm, family, joy. Animated (Higgsfield) — the
          CinematicVideo plays the .mp4 then settles on the .png; until the clip renders the poster shows. */}
      <ChapterSection
        id="chapter-02"
        scrim="radial-gold"
        background={
          <CinematicVideo
            src="/images/bliss/bliss-pushups.mp4"
            poster="/images/bliss/bliss-pushups.png"
            alt="A father doing push-ups in a sunlit field, his daughter laughing on his back, kids playing"
            objectPosition="center 40%"
          />
        }
      >
        <div style={{ maxWidth: "30ch" }}>
          <span className={styles.eyebrow}>{REASON.eyebrow}</span>
          {REASON.lines.slice(0, 2).map((line, i) => (
            <RevealText
              key={line}
              as="p"
              text={line}
              splitBy="word"
              className={styles.storyLine}
              delay={0.1 + i * 0.18}
              style={{ marginBlockEnd: "0.85rem" }}
            />
          ))}
        </div>
      </ChapterSection>

      {/* 02b — strength, its OWN full-bleed page (non-family image gives a deliberate offset after the
          push-ups kids; fits the line "someone is learning what strength looks like"). */}
      <ChapterSection
        id="chapter-02b"
        scrim="left"
        background={
          <Image
            src="/images/bliss/bliss-carry.png"
            alt="A man carrying a heavy timber beam on his shoulder at a build site"
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover", objectPosition: "center center" }}
          />
        }
      >
        <div style={{ maxWidth: "32ch" }}>
          {REASON.lines.slice(2).map((line, i) => (
            <RevealText
              key={line}
              as="p"
              text={line}
              splitBy="word"
              className={styles.storyLine}
              delay={0.1 + i * 0.2}
              style={{ marginBlockEnd: "0.85rem" }}
            />
          ))}
        </div>
      </ChapterSection>
    </>
  );
}
