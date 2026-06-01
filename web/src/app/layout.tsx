import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roar Bliss | Surgical Voice Personalization & Personal Battle Hymns",
  description: "Turn iconic speeches into your personal battle hymns. Graft your name, family, and exact struggle directly into motivational speeches with surgical voice cloning, cinematic soundscape alignment, and zero timeline drift.",
  keywords: ["motivational speeches", "voice cloning", "custom audio", "personal growth", "workout playlist", "Clarence", "Eric Thomas", "Les Brown"],
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
