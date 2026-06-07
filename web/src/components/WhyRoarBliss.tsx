import React from "react";

export default function WhyRoarBliss() {
  return (
    <section id="why" className="section-band">
      <div className="sec-bg" style={{ backgroundImage: "url(/images/sec-why.jpg)", opacity: 0.3 }} />
      <div className="sec-overlay" />
      <div className="section-pad" style={{ textAlign: "center" }}>
      <span className="section-eyebrow">Why RoarBliss</span>
      <p className="pull-quote" style={{ maxWidth: "20ch", marginInline: "auto" }}>
        It is not motivation. It is your story turned into the{" "}
        <span className="roar-accent">voice that pulls you forward.</span>
      </p>
      <p className="section-sub" style={{ marginInline: "auto", marginBlockStart: "1.5rem", textAlign: "center" }}>
        A man does not open RoarBliss because he wants another AI tool. He opens it because he needs to
        hear the speech that reminds him who he is.
      </p>
      </div>
    </section>
  );
}
