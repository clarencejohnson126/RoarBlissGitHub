"use client";

import Image from "next/image";
import Link from "next/link";
import ScrollProgress from "@/components/story/ScrollProgress";
import StoryNavbar from "@/components/story/StoryNavbar";
import StoryHero from "@/components/story/StoryHero";
import SilenceChapter from "@/components/story/SilenceChapter";
import ReasonChapter from "@/components/story/ReasonChapter";
import BattleCards from "@/components/story/BattleCards";
import InstrumentalSelector from "@/components/audio/InstrumentalSelector";
import ProcessTimeline from "@/components/story/ProcessTimeline";
import DepthScale from "@/components/story/DepthScale";
import LanguageSection from "@/components/story/LanguageSection";
import NotMotivation from "@/components/story/NotMotivation";
import Marquee from "@/components/story/Marquee";
import FaqSection from "@/components/story/FaqSection";
import Testimonials from "@/components/story/Testimonials";
import FinalCta from "@/components/story/FinalCta";
import { SAFE_NOTE } from "@/components/story/content";
import styles from "@/components/story/story.module.css";

export default function StoryPage() {
  return (
    <div className={styles.page}>
      <ScrollProgress />
      <StoryNavbar />

      <main>
        <StoryHero />
        <SilenceChapter />
        <ReasonChapter />
        <BattleCards />
        <InstrumentalSelector />
        <ProcessTimeline />
        <DepthScale />
        <LanguageSection />
        <NotMotivation />
        <Marquee />
        <FaqSection />
        <Testimonials />
        <FinalCta />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <Image src="/images/logo-symbol.png" alt="Roar Bliss" width={72} height={72} className={styles.brandLogo} />
          <span className={styles.brandWord}>ROAR<b>BLISS</b></span>
        </div>
        <p className={styles.safeNote}>{SAFE_NOTE}</p>
        <p className={styles.footerCopy}>
          <Link href="/terms" style={{ color: "inherit" }}>Terms</Link>
          {"  ·  "}
          <Link href="/privacy" style={{ color: "inherit" }}>Privacy</Link>
        </p>
        <p className={styles.footerCopy}>© 2026 Roar Bliss · an app by Rebelz AI. Your story, your battle, your roar.</p>
      </footer>
    </div>
  );
}
