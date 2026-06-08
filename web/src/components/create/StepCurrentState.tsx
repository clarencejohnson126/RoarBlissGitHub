"use client";

import { useCreateFlow } from "./CreateFlowProvider";
import { NEEDED_EMOTIONS, LIFE_PRESSURE, REASONS, type CreateFlowData } from "./createData";
import StepShell from "./StepShell";
import styles from "./create.module.css";

function ChipGroup({
  q,
  options,
  field,
  max = 3,
}: {
  q: string;
  options: string[];
  field: keyof CreateFlowData;
  max?: number;
}) {
  const { data, toggleArray } = useCreateFlow();
  const selected = (data[field] as string[]) ?? [];
  return (
    <div className={styles.chipGroup}>
      <div className={styles.chipQ}>{q}</div>
      <div className={styles.chipGrid}>
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              className={`${styles.chip} ${on ? styles.chipOn : ""}`}
              onClick={() => toggleArray(field, o, max)}
              aria-pressed={on}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StepCurrentState() {
  const { data, update, next } = useCreateFlow();
  const valid = data.neededEmotions.length >= 1 && data.reasonForFighting.length >= 1;

  return (
    <StepShell
      image="warrior-prayer"
      eyebrow="03 · Your state"
      headline={
        <>
          What are you <span className={styles.gold}>facing</span> right now?
        </>
      }
      sub="Give us enough truth to make the speech feel like it was written for your life. The more honest, the stronger the result."
      onNext={() => valid && next()}
      nextDisabled={!valid}
      wide
    >
      <ChipGroup q="What do you need most right now?" options={NEEDED_EMOTIONS} field="neededEmotions" />
      <ChipGroup q="What is the main pressure in your life?" options={LIFE_PRESSURE} field="lifePressure" />
      <ChipGroup q="Who are you doing this for?" options={REASONS} field="reasonForFighting" />

      <div className={styles.chipGroup}>
        <label className={styles.chipQ} htmlFor="rb-reminder">
          In one or two sentences, what should this speech remind you of? <span style={{ color: "var(--color-text-muted)", fontWeight: 400, fontSize: "0.85rem" }}>(optional)</span>
        </label>
        <textarea
          id="rb-reminder"
          className={styles.textarea}
          value={data.reminderText}
          onChange={(e) => update({ reminderText: e.target.value })}
          placeholder="Remind me that I still have time, that my children are watching, and that I cannot quit now."
          maxLength={600}
        />
      </div>
    </StepShell>
  );
}
