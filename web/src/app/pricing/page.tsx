import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import PricingCards from "./PricingCards";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing — Roar Bliss",
  description:
    "Start free. Go deeper when you're ready. Turn the audio you love into motivational speeches written for your life — Starter, Warrior, and Legend plans.",
};

export default function PricingPage() {
  return (
    <div className={styles.wrap}>
      <Navbar />
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>Pricing</span>
          <h1 className={styles.h1}>
            Find the voice that <span className={styles.gold}>pulls you forward.</span>
          </h1>
          <p className={styles.sub}>
            Start free. Go deeper when you&apos;re ready. Every plan turns the audio you love into speeches written for
            your life — your story, your battle, your roar.
          </p>
        </div>
        <PricingCards />
      </div>
    </div>
  );
}
