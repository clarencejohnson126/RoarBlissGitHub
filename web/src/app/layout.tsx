import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
