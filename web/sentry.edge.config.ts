import * as Sentry from "@sentry/nextjs";

// Edge runtime (middleware / edge routes). No-ops cleanly if the DSN is unset.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
