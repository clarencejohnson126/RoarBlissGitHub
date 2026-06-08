import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow a second dev server (the cinematic /story preview on :3010) to run alongside the main
  // one on :3009. Next 16 locks one dev server per dist dir, so the story script sets NEXT_DISTDIR.
  distDir: process.env.NEXT_DISTDIR || ".next",
  turbopack: {
    root: path.resolve(process.cwd())
  }
};

export default nextConfig;
