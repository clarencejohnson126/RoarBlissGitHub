import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Allow a second dev server (the cinematic /story preview on :3010) to run alongside the main
  // one on :3009. Next 16 locks one dev server per dist dir, so the story script sets NEXT_DISTDIR.
  distDir: process.env.NEXT_DISTDIR || ".next",
  turbopack: {
    root: path.resolve(process.cwd())
  }
};

export default withSentryConfig(nextConfig, {
  org: "rebelz-ai",
  project: "roar-bliss",
  silent: !process.env.CI,
  // Source-map upload disabled (the available token is upload-scoped/optional). Errors are still
  // captured — just with minified stacks. Enable later with a project-scoped SENTRY_AUTH_TOKEN.
  sourcemaps: { disable: true },
});
