"use client";

import { useCreateFlow } from "./CreateFlowProvider";
import { TONES, DEPTHS, LANGUAGES, type Intensity } from "./createData";
import StepShell from "./StepShell";
import styles from "./create.module.css";

const INTENSITIES: Intensity[] = ["low", "medium", "high"];
const INTENSITY_LABELS = ["Gentle reminder", "Strong push", "No excuses"];

export default function StepSpeechStyle() {
  const { data, update, next } = useCreateFlow();
  const valid = !!data.primaryTone;

  const onTone = (title: string) => {
    if (data.primaryTone === title) update({ primaryTone: data.secondaryTone, secondaryTone: "" });
    else if (data.secondaryTone === title) update({ secondaryTone: "" });
    else if (!data.primaryTone) update({ primaryTone: title });
    else update({ secondaryTone: title });
  };

  const idx = INTENSITIES.indexOf(data.intensity);

  return (
    <StepShell
      image="empty-hall"
      eyebrow="04 · Style"
      headline={
        <>
          How should the voice <span className={styles.gold}>hit you?</span>
        </>
      }
      sub="Choose the emotional delivery. Peace, fire, or truth — you decide how it lands."
      onNext={() => valid && next()}
      nextDisabled={!valid}
      wide
    >
      <div className={styles.toneGrid}>
        {TONES.map((t) => {
          const primary = data.primaryTone === t.title;
          const secondary = data.secondaryTone === t.title;
          return (
            <button
              key={t.title}
              type="button"
              className={`${styles.toneCard} ${primary ? styles.tonePrimary : ""} ${secondary ? styles.toneSecondary : ""}`}
              onClick={() => onTone(t.title)}
              aria-pressed={primary || secondary}
            >
              {primary && <span className={styles.toneBadge}>Primary</span>}
              {secondary && <span className={styles.toneBadge}>Second</span>}
              <div className={styles.toneTitle}>{t.title}</div>
              <div className={styles.toneDesc}>{t.desc}</div>
            </button>
          );
        })}
      </div>

      <div className={styles.blockLabel}>Intensity</div>
      <input
        className={styles.slider}
        type="range"
        min={0}
        max={2}
        step={1}
        value={idx}
        onChange={(e) => update({ intensity: INTENSITIES[parseInt(e.target.value, 10)] })}
        aria-label="Intensity"
      />
      <div className={styles.sliderLabels}>
        {INTENSITY_LABELS.map((l, i) => (
          <span key={l} style={{ color: i === idx ? "var(--color-gold)" : undefined }}>
            {l}
          </span>
        ))}
      </div>

      <div className={styles.blockLabel}>How much becomes yours?</div>
      <div className={styles.depthRow}>
        {DEPTHS.map((d) => (
          <button
            key={d.value}
            type="button"
            className={`${styles.depthBtn} ${data.personalizationDepth === d.value ? styles.depthBtnOn : ""}`}
            onClick={() => update({ personalizationDepth: d.value })}
          >
            <div className={styles.depthNum}>{d.label}</div>
            <div className={styles.depthHint}>{d.hint}</div>
          </button>
        ))}
      </div>
      <p className={styles.hint}>The deeper you go, the more the speech becomes yours. Free preview is the first 45s at 75%.</p>

      <div className={styles.blockLabel}>Language</div>
      <div className={styles.langRow}>
        {LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            className={`${styles.chip} ${data.language === l ? styles.chipOn : ""}`}
            onClick={() => update({ language: l })}
          >
            {l}
          </button>
        ))}
      </div>
    </StepShell>
  );
}
