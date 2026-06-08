"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap, useGSAP } from "./hooks/useGSAPScrollTrigger";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import MagneticButton from "./MagneticButton";
import { FINAL } from "./content";
import styles from "./story.module.css";

/**
 * Final beat: a tall section with a sticky full-screen portrait. As you scroll, the CTA text fades
 * away and the fighter's face is revealed (a gentle push-in). Driven by GSAP ScrollTrigger, which
 * is bridged to Lenis (lenis.on('scroll', ScrollTrigger.update)) so it scrubs reliably.
 */
export default function FinalCta() {
  const section = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reduced || !section.current) return;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: section.current, start: "top top", end: "bottom bottom", scrub: 0.4 },
      });
      // text moves away over the first ~half of the scroll; face keeps a slow push-in
      tl.to(textRef.current, { opacity: 0, yPercent: -60, ease: "none", duration: 0.5 }, 0);
      tl.to(faceRef.current, { scale: 1.1, ease: "none", duration: 1 }, 0);
    },
    { dependencies: [reduced], scope: section },
  );

  return (
    <section ref={section} id="chapter-09" className={styles.finalTall}>
      <div className={styles.finalSticky}>
        <div ref={faceRef} className={styles.finalFace}>
          <Image
            src="/images/story/closeup-warrior.png"
            alt="A close portrait of a battle-worn warrior"
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover", objectPosition: "center 28%" }}
          />
        </div>
        <div className={styles.scrimBottom} aria-hidden />

        <div ref={textRef} style={{ position: "relative", zIndex: 2, textAlign: "center", marginInline: "auto", maxWidth: 760 }}>
          <span className={styles.eyebrow}>{FINAL.eyebrow}</span>
          <h2 className={styles.finalQuote}>
            {FINAL.pre}
            <span className={styles.gold}>{FINAL.gold}</span>
          </h2>
          <p className={styles.lead} style={{ marginInline: "auto" }}>
            {FINAL.sub}
          </p>
          <div className={styles.btnRow} style={{ justifyContent: "center" }}>
            <MagneticButton>
              <Link href={FINAL.primary.href} className={styles.btnGold}>
                {FINAL.primary.label}
              </Link>
            </MagneticButton>
            <MagneticButton>
              <Link href={FINAL.secondary.href} className={styles.btnGhost}>
                {FINAL.secondary.label}
              </Link>
            </MagneticButton>
          </div>
        </div>
      </div>
    </section>
  );
}
