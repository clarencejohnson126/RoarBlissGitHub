"use client";

import { useCreateFlow } from "./CreateFlowProvider";
import StepShell from "./StepShell";
import styles from "./create.module.css";

export default function StepName() {
  const { data, update, next } = useCreateFlow();
  const valid = data.userName.trim().length >= 2;

  return (
    <StepShell
      image="bliss-portrait"
      eyebrow="01 · Name"
      headline={
        <>
          What should your speech <span className={styles.gold}>call you?</span>
        </>
      }
      sub="Every battle speech starts with a name. Tell RoarBliss who this is for."
      onNext={() => valid && next()}
      nextDisabled={!valid}
    >
      <label className={styles.label} htmlFor="rb-name">
        Your name
      </label>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input
        id="rb-name"
        className={styles.input}
        value={data.userName}
        onChange={(e) => update({ userName: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) next();
        }}
        placeholder="Clarence"
        autoFocus
        maxLength={40}
      />
      <p className={styles.hint}>
        Real name, nickname, or a name you want the voice to call you. This is for you — use whatever feels right.
      </p>
    </StepShell>
  );
}
