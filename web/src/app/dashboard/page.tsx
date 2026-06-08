"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { TIERS, tierById } from "@/lib/tiers";
import { BATTLES, TONES, LANGUAGES } from "@/components/create/createData";
import styles from "./dashboard.module.css";

type Me = { authenticated: boolean; email?: string; credits?: number; tier?: string | null; profile?: Profile | null };
type Profile = { nickname?: string; people?: string; battles?: string[]; tone?: string; language?: string };
type Tab = "overview" | "profile" | "settings";

const EMPTY_PROFILE: Profile = { nickname: "", people: "", battles: [], tone: "", language: "English" };

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [saved, setSaved] = useState("");

  const loadMe = useCallback(async (tok: string) => {
    try {
      const r = await fetch("/api/me", { headers: { Authorization: `Bearer ${tok}` } });
      const j: Me = await r.json();
      setMe(j);
      if (j.profile) setProfile({ ...EMPTY_PROFILE, ...j.profile });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      const tok = data.session?.access_token ?? null;
      setToken(tok);
      setReady(true);
      if (tok) loadMe(tok);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      const tok = s?.access_token ?? null;
      setToken(tok);
      if (tok) loadMe(tok);
    });
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return () => sub.subscription.unsubscribe();
  }, [loadMe]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setMsg("Sending sign-in link…");
    try {
      const r = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: typeof window !== "undefined" ? window.location.href : undefined }),
      });
      const j = await r.json();
      setMsg(r.ok ? "Check your email for the sign-in link." : j.error || "Sign-in failed.");
    } catch {
      setMsg("Network error — please try again.");
    }
  };

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    setToken(null);
    setMe(null);
  };

  const toggleBattle = (b: string) =>
    setProfile((p) => ({ ...p, battles: (p.battles || []).includes(b) ? (p.battles || []).filter((x) => x !== b) : [...(p.battles || []), b] }));

  const saveProfile = async () => {
    setSaved("Saving…");
    const { error } = await supabaseBrowser().auth.updateUser({ data: { profile } });
    setSaved(error ? error.message : "Saved ✓");
    if (!error && token) loadMe(token);
  };

  // ── not signed in ────────────────────────────────────────────────────────
  if (ready && !token) {
    return (
      <div className={styles.wrap}>
        <Navbar />
        <div className={styles.center}>
          <span className={styles.eyebrow}>Your dashboard</span>
          <h1 className={styles.h1}>Sign in to your roar.</h1>
          <p className={styles.sub}>Your speeches, your profile and your plan — all in one place.</p>
          <form className={styles.signin} onSubmit={signIn}>
            <input className={styles.signinInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
            <button className={styles.signinBtn} type="submit">Send link</button>
          </form>
          {msg && <p className={styles.sub} style={{ marginTop: "0.75rem" }}>{msg}</p>}
        </div>
      </div>
    );
  }

  const tier = tierById(me?.tier);
  const planName = tier ? tier.name : "Free";
  const firstName = (profile.nickname || me?.email?.split("@")[0] || "warrior").trim();

  return (
    <div className={styles.wrap}>
      <Navbar />
      <div className={styles.inner}>
        <span className={styles.eyebrow}>Your dashboard</span>
        <h1 className={styles.h1}>
          Welcome back, <span className={styles.gold}>{firstName}.</span>
        </h1>
        <p className={styles.sub}>Pick up where you left off — or forge a new speech.</p>

        <div className={styles.tabs}>
          {(["overview", "profile", "settings"] as Tab[]).map((t) => (
            <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className={styles.grid}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Your plan</div>
                <div className={styles.cardValue}>{planName}</div>
                <div className={styles.cardSub}>{tier ? `${tier.minutes} min / month` : "45-second previews, 1 per device"}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Credits</div>
                <div className={`${styles.cardValue} ${styles.cardValueGold}`}>{me?.credits ?? 0}</div>
                <div className={styles.cardSub}>Each credit = one full speech (up to 6 min).</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Email</div>
                <div className={styles.cardValue} style={{ fontSize: "1.1rem", wordBreak: "break-all" }}>{me?.email}</div>
                <div className={styles.cardSub}>Magic-link sign-in.</div>
              </div>
            </div>

            <div className={styles.actions}>
              <Link href="/create" className={styles.btnGold}>Create new speech</Link>
              <Link href="/pricing" className={styles.btnGhost}>{tier ? "Manage plan" : "Upgrade plan"}</Link>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Your speeches</h2>
              <div className={styles.empty}>
                Your generated speeches will appear here. Make your first one and it&apos;ll show up.
                <div style={{ marginTop: "1rem" }}>
                  <Link href="/create" className={styles.btnGold}>Start your first speech</Link>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "profile" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Your story, saved</h2>
            <p className={styles.sub} style={{ marginBottom: "1.5rem" }}>
              We&apos;ll use this to pre-fill your next speech so you don&apos;t start from scratch.
            </p>
            <div className={styles.field}>
              <label className={styles.label}>What should the voice call you?</label>
              <input className={styles.input} value={profile.nickname || ""} onChange={(e) => setProfile((p) => ({ ...p, nickname: e.target.value }))} placeholder="Clarence" maxLength={40} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Who are you doing this for?</label>
              <input className={styles.input} value={profile.people || ""} onChange={(e) => setProfile((p) => ({ ...p, people: e.target.value }))} placeholder="My children, my future self…" maxLength={160} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Your common battles</label>
              <div className={styles.chipRow}>
                {BATTLES.map((b) => (
                  <button key={b.title} type="button" className={`${styles.chip} ${(profile.battles || []).includes(b.title) ? styles.chipOn : ""}`} onClick={() => toggleBattle(b.title)}>
                    {b.title}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Preferred tone</label>
              <div className={styles.chipRow}>
                {TONES.map((t) => (
                  <button key={t.title} type="button" className={`${styles.chip} ${profile.tone === t.title ? styles.chipOn : ""}`} onClick={() => setProfile((p) => ({ ...p, tone: p.tone === t.title ? "" : t.title }))}>
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Preferred language</label>
              <div className={styles.chipRow}>
                {LANGUAGES.map((l) => (
                  <button key={l} type="button" className={`${styles.chip} ${profile.language === l ? styles.chipOn : ""}`} onClick={() => setProfile((p) => ({ ...p, language: l }))}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.btnGold} onClick={saveProfile}>Save profile</button>
            </div>
            {saved && <p className={styles.saveMsg}>{saved}</p>}
          </div>
        )}

        {tab === "settings" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Settings</h2>
            <div className={styles.row}>
              <div>
                <div className={styles.rowLabel}>Email</div>
                <div className={styles.rowSub}>{me?.email}</div>
              </div>
            </div>
            <div className={styles.row}>
              <div>
                <div className={styles.rowLabel}>Subscription</div>
                <div className={styles.rowSub}>{tier ? `${tier.name} — ${tier.minutes} min/month` : "Free — no active subscription"}</div>
              </div>
              <Link href="/pricing" className={styles.btnGhost}>{tier ? "Change plan" : "Upgrade"}</Link>
            </div>
            <div className={styles.row}>
              <div>
                <div className={styles.rowLabel}>Credits</div>
                <div className={styles.rowSub}>{me?.credits ?? 0} available</div>
              </div>
              <Link href="/pricing" className={styles.btnGhost}>Buy more</Link>
            </div>
            <div className={styles.actions}>
              <button className={styles.btnDanger} onClick={signOut}>Sign out</button>
            </div>
            <p className={styles.sub} style={{ marginTop: "1.5rem", fontSize: "0.82rem" }}>
              Need to cancel or update billing? Manage your subscription from the plan page. To delete your account, contact support.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
