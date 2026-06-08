"use client";

import { Check } from "lucide-react";
import { useCreateFlow } from "./CreateFlowProvider";
import styles from "./create.module.css";

const STEPS = ["Name", "Battle", "State", "Style", "Details", "Audio"];

export default function ProgressIndicator() {
  const { step, setStep } = useCreateFlow();
  return (
    <div className={styles.progress}>
      <div className={styles.progressInner}>
        {STEPS.map((label, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <div key={label} style={{ display: "contents" }}>
              <button
                type="button"
                className={`${styles.progressItem} ${active ? styles.progressActive : ""} ${done ? styles.progressDone : ""}`}
                style={{ background: "none", border: "none", cursor: done ? "pointer" : "default" }}
                onClick={() => done && setStep(i)}
                aria-current={active ? "step" : undefined}
              >
                <span className={styles.progressDot}>{done ? <Check size={14} /> : `0${i + 1}`}</span>
                <span className={styles.progressLabel}>{label}</span>
              </button>
              {i < STEPS.length - 1 && <span className={styles.progressSep} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
