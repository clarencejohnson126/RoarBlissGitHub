import React from "react";

const LEVELS = [
  { pct: "25%", title: "Light personalization", desc: "Keep most of the original. A few key lines become your story — your name, your fight." },
  { pct: "50%", title: "Balanced transformation", desc: "Half the spoken lines are rewritten for you, half stay in the original's world." },
  { pct: "75%", title: "Deeply personal", desc: "Most of the speech is yours now — the original tone carries your life." },
  { pct: "Full", title: "Your complete battle speech", desc: "A brand-new script, start to finish, spoken in the preserved voice and tone over the same music." },
];

export default function PersonalizationDepth() {
  return (
    <section id="personalization" className="section-band">
      <div className="sec-bg" style={{ backgroundImage: "url(/images/sec-depth.jpg)" }} />
      <div className="sec-overlay" />
      <div className="section-pad">
      <span className="section-eyebrow">Personalization depth</span>
      <h2 className="section-head">How much of it becomes yours.</h2>
      <p className="section-sub">You decide how far the rewrite goes — from a few personal lines to a complete battle speech.</p>
      <div className="feature-grid">
        {LEVELS.map((l) => (
          <div key={l.pct} className="feature-card">
            <div className="fc-step">{l.pct}</div>
            <div className="fc-title">{l.title}</div>
            <div className="fc-desc">{l.desc}</div>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
