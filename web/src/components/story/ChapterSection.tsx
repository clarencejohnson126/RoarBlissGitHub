"use client";

import { type ReactNode } from "react";
import styles from "./story.module.css";

type Scrim = "bottom" | "left" | "vignette" | "radial-gold" | "soft" | "none";

const scrimClass: Record<Scrim, string> = {
  bottom: styles.scrimBottom,
  left: styles.scrimLeft,
  vignette: styles.scrimVignette,
  "radial-gold": styles.scrimRadialGold,
  soft: styles.scrimSoft,
  none: "",
};

export default function ChapterSection({
  id,
  children,
  background,
  scrim = "vignette",
  full = true,
  center = false,
  className,
  contentClassName,
}: {
  id?: string;
  children: ReactNode;
  background?: ReactNode;
  scrim?: Scrim;
  full?: boolean;
  center?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const cx = [styles.chapter, full ? styles.chapterFull : "", center ? styles.chapterCenter : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <section id={id} className={cx}>
      {background ? <div className={styles.bgLayer}>{background}</div> : null}
      {scrim !== "none" ? <div className={scrimClass[scrim]} aria-hidden /> : null}
      <div className={[styles.inner, contentClassName].filter(Boolean).join(" ")}>{children}</div>
    </section>
  );
}
