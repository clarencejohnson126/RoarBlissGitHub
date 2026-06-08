"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import styles from "./story.module.css";

// R3F is client-only + heavy → load it after hydration, out of the initial bundle.
const ParticleField = dynamic(() => import("./ParticleField"), { ssr: false });

/**
 * Fixed, full-viewport atmospheric ember layer behind all scrolling content.
 * Renders nothing (no WebGL context) when the user prefers reduced motion or before mount.
 */
export default function ParticleBackground() {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (reduced || !mounted) return null;

  return (
    <div className={styles.particleWrap} aria-hidden>
      <ParticleField />
    </div>
  );
}
