import React from "react";

const QA = [
  {
    q: "What audio can I upload?",
    a: "Any motivational speech, song, or podcast stem you own or have permission to use. RoarBliss is built for permitted audio adaptation and your own original content.",
  },
  {
    q: "Does it copy a real person's voice?",
    a: "No. RoarBliss preserves the emotional tone and delivery style of the audio you provide — it does not impersonate real people. You choose the tone; your story drives the words.",
  },
  {
    q: "How much gets rewritten?",
    a: "You decide: 25%, 50%, 75%, or a full rewrite. Light personalization keeps most of the original; a full rewrite makes the whole speech your own — while the music stays the same.",
  },
  {
    q: "Can it be in another language?",
    a: "Yes. Choose a target language and the whole speech is delivered in it, with the original tone preserved.",
  },
  {
    q: "How long does it take?",
    a: "A short preview is ready in moments. Full personalized speeches are generated in the cloud and delivered as soon as they're done — you can wait on the page or get notified.",
  },
  {
    q: "Who owns the result?",
    a: "You do. RoarBliss is designed for personal transformation and original motivational content you create from audio you're allowed to use.",
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="section-band">
      <div className="sec-bg" style={{ backgroundImage: "url(/images/sec-faq.jpg)" }} />
      <div className="sec-overlay" />
      <div className="section-pad">
      <span className="section-eyebrow">Questions</span>
      <h2 className="section-head">Before your first roar.</h2>
      <div className="feature-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {QA.map((item) => (
          <div key={item.q} className="feature-card">
            <div className="fc-title">{item.q}</div>
            <div className="fc-desc">{item.a}</div>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
