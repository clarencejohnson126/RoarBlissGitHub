import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import CinematicAudioProvider from "@/components/audio/CinematicAudioProvider";

// Self-hosted at build time → guaranteed to load (no runtime Google-CDN dependency).
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RoarBliss — Turn motivational audio into your personal battle speech",
  description: "Your story, your battle, your roar. Personalize motivational audio you own into a cinematic battle speech — rewrite the words for your own struggle while preserving the emotional tone and music.",
  keywords: ["motivational audio", "personalized speech", "personal transformation", "battle speech", "audio personalization", "motivation app"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={playfair.variable}>
      <body>
        {/* App-wide so background music started on /story keeps playing into /create.
            The unlock overlay only appears on /story; the mini-player persists once unlocked. */}
        <CinematicAudioProvider>{children}</CinematicAudioProvider>
      </body>
    </html>
  );
}
