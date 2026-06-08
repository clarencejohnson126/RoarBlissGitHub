"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe `prefers-reduced-motion` hook. Returns a stable `false` on the server and on first
 * client render (so hydration matches), then updates after mount and on live changes.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
