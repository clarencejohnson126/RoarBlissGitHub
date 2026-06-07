import React from "react";
import Link from "next/link";

const TEMPLATES = [
  { title: "Discipline", desc: "For the grind nobody sees — the reps, the early mornings, the quiet work." },
  { title: "Heartbreak", desc: "Turn the wound into resolve. Rise from what broke you." },
  { title: "Grief", desc: "Carry the loss forward with strength, not silence." },
  { title: "Muscle Gain", desc: "Fuel the training — pain thresholds, last sets, new records." },
  { title: "Business Comeback", desc: "For the founder rebuilding after the setback. Back on your feet." },
  { title: "Fatherhood", desc: "Be the example, not just the words. For the ones who watch you." },
  { title: "Confidence", desc: "Step into the room as the man who already decided." },
  { title: "Dark Season", desc: "When it's heaviest — the voice that keeps you standing." },
];

export default function BattleTemplates() {
  return (
    <section id="templates" className="section-band">
      <div className="sec-bg" style={{ backgroundImage: "url(/images/sec-templates.jpg)" }} />
      <div className="sec-overlay" />
      <div className="section-pad">
      <span className="section-eyebrow">Choose your battle</span>
      <h2 className="section-head">Every fight has a voice.</h2>
      <p className="section-sub">Pick a template to set the tone, or write a custom prompt about your own life.</p>
      <div className="feature-grid">
        {TEMPLATES.map((t) => (
          <Link key={t.title} href="/create" className="feature-card" style={{ textDecoration: "none" }}>
            <div className="fc-title">{t.title}</div>
            <div className="fc-desc">{t.desc}</div>
          </Link>
        ))}
      </div>
      </div>
    </section>
  );
}
