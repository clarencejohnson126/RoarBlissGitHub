"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useCreateFlow } from "./CreateFlowProvider";
import { BATTLES } from "./createData";
import StepShell from "./StepShell";
import styles from "./create.module.css";

export default function StepBattle() {
  const { data, toggleArray, next } = useCreateFlow();
  const valid = data.selectedBattles.length >= 1;
  const firstName = (data.userName || "").trim().split(" ")[0];

  return (
    <StepShell
      image="bliss-building"
      eyebrow="02 · Battle"
      headline={
        <>
          {firstName ? `Alright, ${firstName}. ` : ""}What <span className={styles.gold}>battle</span> are you in?
        </>
      }
      sub="Pick one or more. Keep it simple, or go deeper in a moment."
      onNext={() => valid && next()}
      nextDisabled={!valid}
      wide
    >
      <div className={styles.battleGrid}>
        {BATTLES.map((b) => {
          const on = data.selectedBattles.includes(b.title);
          return (
            <motion.button
              key={b.title}
              type="button"
              whileTap={{ scale: 0.98 }}
              className={`${styles.battleCard} ${on ? styles.battleCardOn : ""}`}
              onClick={() => toggleArray("selectedBattles", b.title)}
              aria-pressed={on}
            >
              {on && <Check size={18} className={styles.battleCheck} />}
              <div className={styles.battleIcon}>{b.icon}</div>
              <div className={styles.battleTitle}>{b.title}</div>
              <div className={styles.battleDesc}>{b.desc}</div>
            </motion.button>
          );
        })}
      </div>
    </StepShell>
  );
}
