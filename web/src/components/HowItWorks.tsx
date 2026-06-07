import React from "react";

const STEPS = [
  { n: "01", title: "Upload your audio", desc: "Bring a motivational speech, song, or podcast stem you own or have permission to use." },
  { n: "02", title: "Choose your battle", desc: "Pick a template — discipline, heartbreak, comeback — or write your own prompt." },
  { n: "03", title: "Add your story", desc: "Your name, your struggle, your goal. The engine writes lines that are unmistakably yours." },
  { n: "04", title: "Generate your speech", desc: "We rewrite the speech for your story while preserving the emotional tone and music." },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="section-pad">
      <span className="section-eyebrow">How it works</span>
      <h2 className="section-head">From their words to your roar.</h2>
      <p className="section-sub">Four steps turn audio you love into the speech that pulls you forward.</p>
      <div className="feature-grid">
        {STEPS.map((s) => (
          <div key={s.n} className="feature-card">
            <div className="fc-step">{s.n}</div>
            <div className="fc-title">{s.title}</div>
            <div className="fc-desc">{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
