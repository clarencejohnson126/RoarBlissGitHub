# Roar Bliss — Handoff Prompt (2026-06-07)

You are taking over the Roar Bliss web app from a previous agent whose context window filled up.
Read this fully before touching anything. Be rigorous, verify visually, and DO NOT repeat the
mistakes flagged below.

## Project basics
- Repo: `/Users/clarence/Desktop/Roar Bliss App`, working dir for the web app: `web/`.
- Branch: `claude/desktop-strips-integration-potential-5pNww` (commit your work here; push regularly).
- Stack: **Next.js 16.2.6 (Turbopack), React 19**. Read `web/AGENTS.md` — "this is NOT the Next.js you know"; check `node_modules/next/dist/docs/` before using unfamiliar APIs.
- **Custom CSS design system** in `web/src/app/globals.css` (CSS variables + classes like `.btn-gold`,
  `.glass-card`, `.section-band`, `.feature-card`). **Tailwind utilities are NOT generated — never use
  `className="flex gap-4"` etc.** Reuse the existing classes + inline styles.
- Fonts: Playfair Display via **next/font** (`layout.tsx`), exposed as `--font-playfair` →
  `--font-serif`. The `<html>` MUST keep `className={playfair.variable}` or it silently falls back to Georgia.
- Dev server: `cd web && npm run dev` (default port 3000; the previous agent used `PORT=3007`).
- Secrets live in `web/.env.local` (gitignored). Anything set there must also be set in Vercel for prod.

## ⚠️ CRITICAL GOTCHA — Turbopack dev CSS cache
Turbopack dev gives the CSS chunk a **stable filename**, so a normal browser reload (Cmd+R) re-serves
the **OLD cached CSS** even after you change it. This caused HOURS of false "it's still broken" loops:
the code was correct but the user's browser showed stale CSS.
- **Always verify CSS changes in an Incognito window or with Cmd+Shift+R / DevTools "Disable cache".**
- When in doubt, `rm -rf web/.next` and restart dev to force a new chunk hash.
- Use the Playwright MCP (loads fresh each navigate) to measure/screenshot — trust that over "the user
  says it's broken," but ALSO tell the user to hard-refresh/incognito.

## What the product is
Users upload their own motivational audio (or pick a preloaded one), choose a battle template OR write a
prompt, choose personalization depth (25/50/75/100%), optionally a target language. The cloud pipeline
(Replicate Cog — the ONLY production pipeline) rewrites the chosen lines in the preserved tone/voice over
the same music. NO celebrity/voice-clone wording anywhere in the UI (legal). The internal `champion`
enum values `"Eric Thomas"`/`"Les Brown"` are **opaque tone keys** that `AudioVisualizer.tsx` and the cog
depend on — only their visible LABELS were changed; do NOT rename the values.

## What was done this session (landing redesign + responsive)
- Cinematic landing in `web/src/components/`: `Navbar, HeroSection, ProcessBar, HowItWorks,
  BattleTemplates (8 templates), PersonalizationDepth, Languages, WhyRoarBliss, FAQ, FinalCTA, SafeUseNote`.
- `web/src/app/page.tsx` = the landing (marketing sections). `web/src/app/create/page.tsx` = the
  upload→generate flow (`OnboardingForm → TeaserPreview → AudioVisualizer`). All CTAs are `<Link href="/create">`.
- Palette reskin (gold `#D6A84F`, ivory `#E8E3D8`, smoke, obsidian, black) in globals.css `:root`.
- Each marketing section has a full-width cinematic background image (`.section-band` > `.sec-bg`
  opacity 0.92 + `.sec-overlay` edge-blend), content centered (`.section-pad`, max-width 1440).
- `OnboardingForm.tsx`: step 2 now shows the 8 real templates (Discipline, Heartbreak, Grief, Muscle
  Gain, Business Comeback, Fatherhood, Confidence, Dark Season). File cap **100MB**, **6-minute** audio
  duration check.
- Sign-in: new route `web/src/app/api/auth/magic-link/route.ts` generates the magic link via Supabase
  admin (`generateLink`) and sends it via **Resend** (Supabase's own SMTP is unconfigured → returns
  HTTP 500 "Error sending confirmation email"). `AccountPanel.tsx` calls this route.

## 🔴 OPEN / UNRESOLVED — fix these (user's explicit list)
1. **HERO STILL CUT OFF ON THE USER'S LAPTOP.** This is NOT solved despite multiple attempts.
   Current rule (globals.css `.hero`): `min-height: clamp(600px, 56.25vw, calc(100svh - 64px))`,
   `object-fit: cover`, `object-position: center center`, sticky 64px navbar above it.
   The previous agent verified at 2560/1440/1440x640/390 in Playwright and it looked correct there, but
   the USER still sees it cut off on his actual laptop. **Do this properly:** ask the user for his exact
   laptop resolution + browser window state (maximized? windowed?), reproduce that EXACT size in
   Playwright, screenshot, and look critically. Consider: (a) is the hero content (headline+sub+CTAs)
   taller than the hero box on his screen? (b) is `object-position` cropping the warrior badly? (c)
   would a fundamentally simpler hero (fixed sensible height ~640–760px on laptop, content with safe
   padding, image cover focused on the warrior) be more robust than chasing 100svh fill? Verify in
   INCOGNITO (see cache gotcha).
2. **Section background images are LOW-RES** (cropped from small collages). The user is providing 6
   better images (landscape, ≥1600px). Drop them at `web/public/images/sec-howitworks.jpg`,
   `sec-templates.jpg`, `sec-depth.jpg` (father & daughter), `sec-languages.jpg`, `sec-why.jpg`
   (sunset cliff with kids — his favorite), `sec-faq.jpg`. Same filenames = no code change needed.
3. **Version pinning** — confirm `web/.env.local` `REPLICATE_MODEL_VERSION` pins the APPROVED cog
   version (per memory the final was `94c1272…`; verify against the live Replicate model
   `clarencejohnson126/roar-bliss`) and that the SAME value is set in Vercel. The web app must never call
   an unpinned/old version. Production pipeline = Replicate Cog ONLY (not Mac, not Render).
4. **Stripe must work.** Currently TEST mode. The user will provide LIVE keys — wire `STRIPE_SECRET_KEY`,
   webhook secret, price IDs (local + Vercel). NEVER write keys into files/commits; `.env.local` only.
   Test the checkout → webhook → `app_metadata.paid_credits` credit grant end-to-end.
5. **Supabase / sign-in must work end-to-end.** (a) Set `RESEND_FROM_EMAIL` to a sender on the user's
   VERIFIED Resend domain (it's verified — currently still the test sender `onboarding@resend.dev`, which
   only delivers to the account owner). (b) In the Supabase dashboard add the redirect URLs (localhost +
   prod) under Auth → URL Configuration so the magic link redirects back. (c) Verify the `free_usage`
   table exists in project `eoahpwciwttfavzpqfnz` and the 1-track-per-device/IP free gate + download-gated
   -by-registration works. (Note: the Supabase MCP in this env is pointed at the WRONG project — a tax
   app — so use the REST endpoints / dashboard, not blind MCP calls.)
6. **Polish the whole app** — responsive across mobile/tablet/laptop/desktop/ultrawide, spacing,
   typography, the /create form UX, the player. Apply best practices; ask "is this high-end?".
7. **Go-live deploy** (`cd web && vercel --prod`) is the USER'S trigger — do not deploy without his say-so.

## Secrets status (in web/.env.local, local only — set in Vercel before go-live)
- `RESEND_API_KEY` = updated this session to the user's new key (re_9CZPvmBN…). Verify it's in Vercel too.
- `RESEND_FROM_EMAIL` = still `Roar Bliss <onboarding@resend.dev>` → MUST change to the verified-domain sender.
- Supabase URL/anon/service-role, Replicate token, Stripe (TEST) — present; Stripe LIVE pending from user.

## How to work (the user is demanding and was frustrated by reactive fixing)
- VERIFY before claiming done: screenshot at real device sizes, look critically, only then report.
- Don't chase one screenshot at a time — reproduce the user's exact case, fix the root cause, verify a matrix.
- Always test CSS in incognito (cache gotcha).
- Respond in German (the user's language). Keep founder-mode, real specifics, no hand-waving.
- End each turn with a concrete next step or question (Antigravity coworker convention in web/AGENTS.md).

## Recent commits on the branch (latest first)
5279fcc design-audit patches · a7f4aa7 hero floor 600 · 06c1ad8 responsive clamp · d0846ad content 1440 ·
b4e400e hero calc(100vh-64) · 196e6d3 sections visible + undark hero · ... (full landing redesign earlier)
