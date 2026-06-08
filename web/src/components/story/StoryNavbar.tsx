"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type Lenis from "lenis";
import LoginButton from "@/components/LoginButton";
import { NAV } from "./content";
import styles from "./story.module.css";

export default function StoryNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#")) return;
    e.preventDefault();
    const el = document.querySelector(href);
    if (!el) return;
    const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
    if (lenis) lenis.scrollTo(el as HTMLElement, { offset: -10 });
    else el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
      <div className={styles.navInner}>
        <Link href="/" className={styles.brand} aria-label="Roar Bliss home">
          <Image src="/images/story/logo.png" alt="Roar Bliss" width={40} height={40} className={styles.brandLogo} />
          <span className={styles.brandWord}>ROAR<b>BLISS</b></span>
        </Link>

        <nav className={styles.navLinks}>
          {NAV.links.map((l) => (
            <a key={l.href} href={l.href} className={styles.navLink} onClick={(e) => jump(e, l.href)}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className={styles.navRight}>
          <LoginButton />
          <Link href={NAV.cta.href} className={styles.navCta}>
            {NAV.cta.label}
          </Link>
        </div>
      </div>
    </header>
  );
}
