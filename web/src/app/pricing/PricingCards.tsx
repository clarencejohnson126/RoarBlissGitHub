"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { TIERS, tierPrice, type Currency } from "@/lib/tiers";
import styles from "./pricing.module.css";

export default function PricingCards() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cur, setCur] = useState<Currency>("eur");

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return () => sub.subscription.unsubscribe();
  }, []);

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
      setMsg(r.ok ? "Check your email for the sign-in link, then pick your plan." : j.error || "Sign-in failed.");
    } catch {
      setMsg("Network error — please try again.");
    }
  };

  const subscribe = async (tierId: string) => {
    if (!token) {
      setMsg("Enter your email above to sign in first — then choose your plan.");
      return;
    }
    setBusy(tierId);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier: tierId, currency: cur }),
      });
      const j = await r.json();
      if (j.url) window.location.href = j.url;
      else {
        setMsg(j.error || "Checkout failed.");
        setBusy(null);
      }
    } catch {
      setMsg("Network error — please try again.");
      setBusy(null);
    }
  };

  return (
    <>
      {!token && (
        <form className={styles.signin} onSubmit={signIn}>
          <input
            className={styles.signinInput}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com — sign in to subscribe"
          />
          <button className={styles.signinBtn} type="submit">
            Sign in
          </button>
        </form>
      )}
      {msg && <p className={styles.msg}>{msg}</p>}

      <div className={styles.currencyToggle} role="group" aria-label="Currency">
        <button type="button" className={`${styles.curBtn} ${cur === "eur" ? styles.curBtnOn : ""}`} onClick={() => setCur("eur")}>
          € EUR
        </button>
        <button type="button" className={`${styles.curBtn} ${cur === "usd" ? styles.curBtnOn : ""}`} onClick={() => setCur("usd")}>
          $ USD
        </button>
      </div>

      <div className={styles.grid}>
        {TIERS.map((t) => (
          <div key={t.id} className={`${styles.card} ${t.popular ? styles.cardPopular : ""}`}>
            {t.popular && <span className={styles.badge}>Most popular</span>}
            <div className={styles.tierName}>{t.name}</div>
            <div className={styles.priceRow}>
              <span className={styles.price}>{tierPrice(t, cur).label}</span>
              <span className={styles.period}>/ month</span>
            </div>
            <p className={styles.tagline}>{t.tagline}</p>
            <ul className={styles.features}>
              {t.features.map((f) => (
                <li key={f} className={styles.feat}>
                  <Check size={16} className={styles.check} /> {f}
                </li>
              ))}
            </ul>
            <button
              className={`${styles.cta} ${t.popular ? styles.ctaGold : styles.ctaGhost}`}
              onClick={() => subscribe(t.id)}
              disabled={busy === t.id}
            >
              {busy === t.id ? "…" : t.cta}
            </button>
          </div>
        ))}
      </div>

      <p className={styles.free}>
        Not ready?{" "}
        <Link className={styles.freeLink} href="/create">
          Try a free 45-second preview
        </Link>{" "}
        — one per device, no card needed.
      </p>
      <p className={styles.note}>
        Prices in EUR, billed monthly, cancel anytime. Each plan includes a monthly minute cap; extra minutes are
        €0.30/min. Only upload audio you own or have permission to use — some features depend on rights, region and
        available processing capacity.
      </p>
    </>
  );
}
