import React from "react";
import Image from "next/image";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section className="hero" id="top">
      <Image
        src="/images/roarbliss-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        style={{ objectFit: "cover", objectPosition: "center center" }}
      />
      <div className="hero-scrim" />
      <div className="hero-content">
        <span className="eyebrow">The voice that reminds you who you are</span>
        <h1 className="headline-serif">
          <span className="hl-line">Your story,</span>
          <span className="hl-line">Your battle,</span>
          <span className="hl-line"><span className="roar-accent">Your roar.</span></span>
        </h1>
        <p className="hero-sub">Turn any motivational audio into your personal battle speech.</p>
        <div className="hero-ctas">
          <Link href="/create" className="btn-premium btn-gold" style={{ textDecoration: "none" }}>
            Create My Speech
          </Link>
          <Link href="/create" className="btn-premium btn-outline-ivory" style={{ textDecoration: "none" }}>
            Try Demo
          </Link>
        </div>
      </div>
    </section>
  );
}
