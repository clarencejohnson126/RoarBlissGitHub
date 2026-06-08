"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap, ScrollTrigger, useGSAP } from "./hooks/useGSAPScrollTrigger";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";

type Props = {
  src: string; // mp4 clip
  poster: string; // still image (also the reduced-motion fallback)
  alt: string;
  objectPosition?: string;
  parallax?: number; // usually 0 — the clip already carries motion
  once?: boolean; // play once on load, then cross-fade to the still poster (no loop, no frozen last frame)
  playWhen?: boolean; // gate playback (e.g. hero waits until the audio-unlock overlay is dismissed)
  className?: string;
};

/**
 * Full-bleed cinematic video layer (Seedance clip). Place inside a `position: relative` parent
 * (ChapterSection's .bgLayer clips it). Autoplays muted. With `once`, it plays a single time and
 * then cross-fades to the still poster image (so the hero settles on the wide scene instead of
 * freezing on the last frame). Under prefers-reduced-motion it renders the still poster only.
 */
export default function CinematicVideo({
  src,
  poster,
  alt,
  objectPosition = "center center",
  parallax = 0,
  once = false,
  playWhen = true,
  className,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  const [ended, setEnded] = useState(false);

  // Gate playback: when playWhen flips true (e.g. the hero overlay is dismissed), start from frame 0
  // so the user sees the full animation — not the tail end that played behind the overlay.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || reduced) return;
    if (playWhen) {
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      setEnded(false);
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playWhen, reduced]);

  useGSAP(
    () => {
      if (reduced || !inner.current || !wrap.current || !parallax) return;
      gsap.fromTo(
        inner.current,
        { yPercent: -parallax },
        { yPercent: parallax, ease: "none", scrollTrigger: { trigger: wrap.current, start: "top bottom", end: "bottom top", scrub: true } },
      );
    },
    { dependencies: [reduced], scope: wrap },
  );

  return (
    <div ref={wrap} className={className} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div ref={inner} style={{ position: "absolute", inset: parallax ? "-12% 0" : 0, willChange: "transform" }}>
        {reduced ? (
          <Image src={poster} alt={alt} fill sizes="100vw" onLoad={() => ScrollTrigger.refresh()} style={{ objectFit: "cover", objectPosition }} />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay={playWhen}
              loop={!once}
              muted
              playsInline
              preload="auto"
              poster={poster}
              aria-label={alt}
              onLoadedData={() => ScrollTrigger.refresh()}
              onEnded={() => setEnded(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition }}
            >
              <source src={src} type="video/mp4" />
            </video>
            {once && (
              // wide still scene that fades in once the clip finishes (no frozen lion close-up)
              <Image
                src={poster}
                alt={alt}
                fill
                priority
                sizes="100vw"
                style={{ objectFit: "cover", objectPosition, opacity: ended ? 1 : 0, transition: "opacity 900ms ease", pointerEvents: "none" }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
