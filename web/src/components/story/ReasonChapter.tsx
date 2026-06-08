"use client";

import ChapterSection from "./ChapterSection";
import CinematicVideo from "./CinematicVideo";
import RevealText from "./RevealText";
import { REASON } from "./content";
import styles from "./story.module.css";

export default function ReasonChapter() {
  return (
    <>
      {/* 02 — mountain-family, full-bleed, text overlay (no nested image) */}
      <ChapterSection
        id="chapter-02"
        scrim="radial-gold"
        background={
          <CinematicVideo
            src="/images/story/mountain-family.mp4"
            poster="/images/story/mountain-family.png"
            alt="A father and his children watching a golden sunset over a mountain valley"
            objectPosition="center center"
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

      {/* 02b — father-daughter, its OWN full-bleed page */}
      <ChapterSection
        id="chapter-02b"
        scrim="left"
        background={
          <CinematicVideo
            src="/images/story/father-daughter.mp4"
            poster="/images/story/father-daughter.png"
            alt="A father holding his daughter, foreheads together, at sunset"
            objectPosition="center 30%"
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
