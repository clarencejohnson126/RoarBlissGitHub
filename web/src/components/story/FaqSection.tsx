"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import ChapterSection from "./ChapterSection";
import RevealText from "./RevealText";
import { FAQ } from "./content";
import styles from "./story.module.css";

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ChapterSection id="chapter-08" scrim="soft" full={false}>
      <span className={styles.eyebrow}>{FAQ.eyebrow}</span>
      <RevealText as="h2" text="Before your first roar." className={styles.headlineHuge} />

      <div className={styles.faqList}>
        {FAQ.items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className={styles.faqItem}>
              <button
                type="button"
                className={styles.faqButton}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                {item.q}
                <Plus size={20} className={`${styles.faqIcon} ${isOpen ? styles.faqIconOpen : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className={styles.faqAnswer}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <p className={styles.faqAnswerInner}>{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </ChapterSection>
  );
}
