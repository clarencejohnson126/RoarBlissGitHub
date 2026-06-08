"use client";

import ChapterSection from "./ChapterSection";
import CinematicImage from "./CinematicImage";
import RevealText from "./RevealText";
import { SILENCE } from "./content";
import styles from "./story.module.css";

export default function SilenceChapter() {
  return (
    <ChapterSection
      id="chapter-01"
      scrim="bottom"
      background={
        <CinematicImage
          src="/images/story/warrior-prayer.png"
          alt="A warrior, head bowed in the firelight, holding the hilt of his sword"
          parallax={14}
          objectPosition="center 35%"
        />
      }
    >
      <span className={styles.eyebrow}>{SILENCE.eyebrow}</span>
      <div style={{ maxWidth: "30ch" }}>
        {SILENCE.lines.map((line, i) => (
          <RevealText
            key={line}
            as="p"
            text={line}
            splitBy="word"
            className={styles.storyLine}
            delay={i * 0.25}
            style={{ marginBlockEnd: "0.85rem" }}
          />
        ))}
      </div>
    </ChapterSection>
  );
}
