"use client";

import { useCreateFlow } from "./CreateFlowProvider";
import StepShell from "./StepShell";
import styles from "./create.module.css";

export default function StepFinalDetails() {
  const { data, update, next } = useCreateFlow();

  return (
    <StepShell
      image="mountain-family"
      eyebrow="05 · Details"
      headline={
        <>
          Anything else the voice <span className={styles.gold}>should know?</span>
        </>
      }
      sub="Optional, but powerful. Add names, goals, memories or a specific situation that should shape your speech."
      onNext={next}
      nextLabel="Continue to audio upload"
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="rb-custom">
          Your story, in your words
        </label>
        <textarea
          id="rb-custom"
          className={styles.textarea}
          style={{ minHeight: 120 }}
          value={data.customPrompt}
          onChange={(e) => update({ customPrompt: e.target.value })}
          placeholder="I lost my job and I'm rebuilding my business. I need the speech to remind me that pressure is not punishment — it is training, and my kids are watching."
          maxLength={800}
        />
        <div style={{ textAlign: "right", fontSize: "0.75rem", color: data.customPrompt.length >= 800 ? "var(--color-gold)" : "var(--color-smoke)", marginTop: "0.35rem" }}>
          {data.customPrompt.length}/800
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rb-goal">Main goal</label>
          <input id="rb-goal" className={styles.input} value={data.mainGoal} onChange={(e) => update({ mainGoal: e.target.value })} placeholder="Ship the business by spring" maxLength={120} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rb-deadline">Deadline / time pressure</label>
          <input id="rb-deadline" className={styles.input} value={data.deadline} onChange={(e) => update({ deadline: e.target.value })} placeholder="90 days" maxLength={120} />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rb-include">Words to include</label>
          <input id="rb-include" className={styles.input} value={data.wordsToInclude} onChange={(e) => update({ wordsToInclude: e.target.value })} placeholder="names, a phrase that matters" maxLength={160} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rb-avoid">Words to avoid</label>
          <input id="rb-avoid" className={styles.input} value={data.wordsToAvoid} onChange={(e) => update({ wordsToAvoid: e.target.value })} placeholder="anything that doesn't fit you" maxLength={160} />
        </div>
      </div>
    </StepShell>
  );
}
