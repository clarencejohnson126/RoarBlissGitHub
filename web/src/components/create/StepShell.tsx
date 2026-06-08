"use client";

import { type ReactNode } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useCreateFlow } from "./CreateFlowProvider";
import ProgressIndicator from "./ProgressIndicator";
import styles from "./create.module.css";

export default function StepShell({
  image,
  eyebrow,
  headline,
  sub,
  children,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  wide = false,
}: {
  image: string;
  eyebrow?: string;
  headline: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  wide?: boolean;
}) {
  const { step, back } = useCreateFlow();

  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden>
        <Image src={image.startsWith("bliss-") ? `/images/bliss/${image}.png` : `/images/story/${image}.png`} alt="" fill priority sizes="100vw" className={styles.bgImg} />
        <div className={styles.bgScrim} />
      </div>

      <ProgressIndicator />

      <div className={styles.stage}>
        <motion.div
          className={`${styles.inner} ${wide ? styles.innerWide : ""}`}
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -26 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
          <h1 className={styles.headline}>{headline}</h1>
          {sub && <p className={styles.sub}>{sub}</p>}

          <div className={styles.body}>{children}</div>

          <div className={styles.nav}>
            {step > 0 && (
              <button type="button" className={styles.btnBack} onClick={back}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <div className={styles.spacer} />
            <button type="button" className={styles.btnGold} onClick={onNext} disabled={nextDisabled}>
              {nextLabel}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
