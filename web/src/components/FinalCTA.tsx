import React from "react";
import Link from "next/link";

export default function FinalCTA() {
  return (
    <section className="section-pad" style={{ textAlign: "center" }}>
      <div
        style={{
          border: "1px solid rgba(214,168,79,0.25)",
          borderRadius: "24px",
          background: "linear-gradient(180deg, rgba(214,168,79,0.06), rgba(8,9,13,0.4))",
          padding: "clamp(2.5rem, 5vw, 4.5rem) clamp(1.5rem, 5vw, 3rem)",
        }}
      >
        <h2 className="pull-quote" style={{ maxWidth: "18ch", marginInline: "auto" }}>
          Stop scrolling. <span className="roar-accent">Hear who you are.</span>
        </h2>
        <p className="section-sub" style={{ marginInline: "auto", marginBlockStart: "1rem", textAlign: "center" }}>
          Your first speech is free. No account needed to start.
        </p>
        <div style={{ marginBlockStart: "2rem" }}>
          <Link href="/create" className="btn-premium btn-gold" style={{ textDecoration: "none" }}>
            Create My Speech
          </Link>
        </div>
      </div>
    </section>
  );
}
