import React from "react";

const LANGS = ["English", "Deutsch", "Español", "Français", "Italiano", "Português", "Nederlands", "Polski"];

export default function Languages() {
  return (
    <section id="languages" className="section-pad">
      <span className="section-eyebrow">Speak your language</span>
      <h2 className="section-head">Hear it in your own tongue.</h2>
      <p className="section-sub">
        Upload an English speech and have it spoken to you in German — or any supported language — while the
        emotional tone and delivery are preserved. Your battle, in the words you think in.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBlockStart: "2.5rem" }}>
        {LANGS.map((l) => (
          <span
            key={l}
            style={{
              fontFamily: "var(--font-heading)", fontSize: "0.9rem", color: "var(--color-ivory)",
              border: "1px solid var(--color-obsidian-border)", borderRadius: "999px",
              padding: "0.55rem 1.1rem", background: "rgba(214,168,79,0.04)",
            }}
          >
            {l}
          </span>
        ))}
      </div>
    </section>
  );
}
