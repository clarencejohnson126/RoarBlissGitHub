import type { Metadata } from "next";
import SmoothScrollProvider from "@/components/story/SmoothScrollProvider";

export const metadata: Metadata = {
  title: "RoarBliss — Your story. Your battle. Your roar.",
  description:
    "A cinematic walk through RoarBliss: turn motivational audio you own or have permission to use into the speech that reminds you who you are — your story, your battle, your roar.",
};

// Nested layout: scopes the Lenis smooth-scroll provider to /story ONLY. The audio provider now
// lives in the ROOT layout so music persists from /story into /create.
export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return <SmoothScrollProvider>{children}</SmoothScrollProvider>;
}
