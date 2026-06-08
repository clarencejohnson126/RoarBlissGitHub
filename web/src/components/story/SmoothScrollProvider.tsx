"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./hooks/useGSAPScrollTrigger";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";

/**
 * Smooth-scroll + scroll-animation provider, scoped to the /story route only (mounted in
 * app/story/layout.tsx). The existing landing (/) and /create keep native scroll.
 *
 * One clock: GSAP's ticker drives Lenis's RAF, and Lenis's scroll event drives ScrollTrigger —
 * so Lenis, ScrollTrigger and any GSAP tween share a single timeline. We never run a second
 * requestAnimationFrame loop. Fully gated behind prefers-reduced-motion.
 */
export default function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    // Always open the cinematic story at the top, not a restored mid-page scroll position.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    // globals.css sets html/body `overflow-x: hidden`, which makes them a scroll container and
    // BREAKS position:sticky (the final face reveal). Override to `clip` for /story only (clip
    // prevents horizontal scroll without breaking sticky); restore on unmount so `/` is untouched.
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlOX = htmlEl.style.overflowX;
    const prevBodyOX = bodyEl.style.overflowX;
    htmlEl.style.overflowX = "clip";
    bodyEl.style.overflowX = "clip";
    const restoreOverflow = () => {
      htmlEl.style.overflowX = prevHtmlOX;
      bodyEl.style.overflowX = prevBodyOX;
    };

    if (reduced) return restoreOverflow; // native scroll; still restore overflow on unmount

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // keep native touch scrolling for mobile a11y + perf
      syncTouch: false,
    });

    // Lenis scroll → keep ScrollTrigger in sync
    lenis.on("scroll", ScrollTrigger.update);

    // GSAP ticker → drive Lenis (single RAF source of truth)
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Recompute trigger positions once async layout settles (images / fonts change heights)
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    if (document.fonts?.ready) document.fonts.ready.then(refresh);
    // initial settle
    const t = window.setTimeout(refresh, 300);

    // Pause smoothing when the tab is hidden (battery / perf)
    const onVisibility = () => (document.hidden ? lenis.stop() : lenis.start());
    document.addEventListener("visibilitychange", onVisibility);

    // expose for in-page anchor scrolling (StoryNavbar)
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    return () => {
      restoreOverflow();
      window.clearTimeout(t);
      window.removeEventListener("load", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      lenis.off("scroll", ScrollTrigger.update);
      gsap.ticker.remove(raf);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, [reduced]);

  return <>{children}</>;
}
