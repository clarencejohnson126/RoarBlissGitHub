"use client";

import React from "react";
import Image from "next/image";

export default function HeroSection({
  onCreate,
  onDemo,
}: {
  onCreate: () => void;
  onDemo: () => void;
}) {
  return (
    <section className="hero" id="top">
      <Image
        src="/images/roarbliss-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        style={{ objectFit: "cover", objectPosition: "center right" }}
      />
      <div className="hero-scrim" />
      <div className="hero-content">
        <span className="eyebrow">The voice that reminds you who you are</span>
        <h1 className="headline-serif">
          Your story,<br />
          Your battle,<br />
          <span className="roar-accent">your roar.</span>
        </h1>
        <p className="hero-sub">Turn any motivational audio into your personal battle speech.</p>
        <div className="hero-ctas">
          <button className="btn-premium btn-gold" onClick={onCreate}>
            Create My Speech
          </button>
          <button className="btn-premium btn-outline-ivory" onClick={onDemo}>
            Try Demo
          </button>
        </div>
      </div>
    </section>
  );
}
