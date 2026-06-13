import React from "react";

const QA = [
  {
    q: "Roar Bliss is in Beta — what should I expect?",
    a: "The core is solid and improving every week. A few small things you'll forgive a beta: generation takes ~5–7 minutes per track (real voice-cloning + mixing on a GPU, not instant); the cloned voice is ~90% you, so a word can occasionally sound slightly off; at lighter tiers (25/50%) a new line can be a touch shorter than the original, leaving a brief breathing gap the music carries; on tracks with very faint background music the separation can leave a subtle texture; translation is beta (see below); and rarely a track needs a quick regenerate — you're never charged for a failed run.",
  },
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
    q: "Can it be in another language? (Beta)",
    a: "Yes — translation is in beta. Choose a target language and the whole speech is re-spoken in it, keeping your cloned voice. Heads-up while we polish it: the result can carry a strong English/American accent, and the translated speech may be a bit shorter than the original (so the music can play on at the end). Same-language tracks are not affected.",
  },
  {
    q: "How long does it take?",
    a: "A short preview is ready in moments. Full personalized speeches are generated in the cloud and delivered as soon as they're done — you can wait on the page or get notified.",
  },
  {
    q: "Who owns the result?",
    a: "You do. RoarBliss is designed for personal transformation and original motivational content you create from audio you're allowed to use.",
  },
  {
    q: "Why does my free track stop at 45 seconds?",
    a: "That's your free preview — one per device, no account needed. Plans unlock full tracks up to 6 minutes and let you create every month.",
  },
  {
    q: "How do I download my track?",
    a: "Listening is free right on the page. To keep the file, create a free account with your email and a password — then the download is yours.",
  },
  {
    q: "What happens to my uploaded file?",
    a: "It's deleted the moment processing finishes — we never keep your source audio. Your finished track stays available for 90 days.",
  },
  {
    q: "It failed — was I charged?",
    a: "No. If a generation doesn't deliver, your minutes (or your free try) are returned automatically. You only ever pay for tracks you actually receive.",
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
