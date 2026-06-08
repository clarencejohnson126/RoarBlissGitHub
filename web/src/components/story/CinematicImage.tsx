"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, ScrollTrigger, useGSAP } from "./hooks/useGSAPScrollTrigger";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  objectPosition?: string;
  /** vertical parallax travel in %, applied to an oversized inner layer */
  parallax?: number;
  /** [from, to] scale scrubbed across the section (e.g. [1.08, 1] for the hero) */
  scale?: [number, number];
  className?: string;
  sizes?: string;
};

/**
 * Full-bleed cinematic image layer. Place inside a `position: relative; overflow: hidden` parent
 * (ChapterSection provides one). Parallax + scale are scrubbed with GSAP ScrollTrigger and fully
 * skipped under prefers-reduced-motion (resting state = the final, visible cover).
 */
export default function CinematicImage({
  src,
  alt,
  priority = false,
  objectPosition = "center center",
  parallax = 10,
  scale,
  className,
  sizes = "100vw",
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reduced || !inner.current || !wrap.current) return;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: wrap.current, start: "top bottom", end: "bottom top", scrub: true },
      });
      if (parallax) tl.fromTo(inner.current, { yPercent: -parallax }, { yPercent: parallax, ease: "none" }, 0);
      if (scale) tl.fromTo(inner.current, { scale: scale[0] }, { scale: scale[1], ease: "none" }, 0);
    },
    { dependencies: [reduced], scope: wrap },
  );

  return (
    <div ref={wrap} className={className} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div ref={inner} style={{ position: "absolute", inset: "-12% 0", willChange: "transform" }}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          onLoad={() => ScrollTrigger.refresh()}
          style={{ objectFit: "cover", objectPosition }}
        />
      </div>
    </div>
  );
}
