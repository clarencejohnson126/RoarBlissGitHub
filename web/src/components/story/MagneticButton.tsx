"use client";

import { useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";

/** Wraps a CTA so it drifts toward the cursor on hover (magnetic). Disabled under reduced motion. */
export default function MagneticButton({ children, strength = 0.3 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();

  const onMove = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    ref.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = "translate(0, 0)";
  };

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ display: "inline-flex", transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)", willChange: "transform" }}
    >
      {children}
    </span>
  );
}
