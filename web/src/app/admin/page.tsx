"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * /admin — founder KPI dashboard. Gated server-side by ADMIN_EMAIL/ADMIN_ALERT_EMAIL (the stats API
 * returns 403 for anyone else); this page just renders the snapshot. Errors live in Sentry — this is
 * the daily business view: runs, delivery rate, spend, users, plans, free-funnel.
 */

type Stats = {
  today: { runs: number; delivered: number; failed: number; estSpendCents: number };
  last7d: { runs: number; delivered: number; failed: number; estSpendCents: number; minutesCharged: number; minutesReleased: number };
  now: { queued: number; running: number };
  users: { total: number; byTier: Record<string, number>; paying: number };
  freeTracksUsed: number;
};

const box: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(214,168,79,0.25)", borderRadius: 12, padding: "1.2rem" };
const label: React.CSSProperties = { fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a8170" };
const value: React.CSSProperties = { fontSize: "1.8rem", fontWeight: 700, color: "#D6A84F", marginTop: 4 };
const sub: React.CSSProperties = { fontSize: 13, color: "#B9B1A3", marginTop: 4 };

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setErr("Sign in (dashboard) with the admin account first."); return; }
      const r = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { setErr(r.status === 403 ? "This page is for the founder account." : `Stats failed (${r.status}).`); return; }
      setStats((await r.json()) as Stats);
    })().catch(() => setErr("Could not load stats."));
  }, []);

  const eur = (c: number) => `$${(c / 100).toFixed(2)}`;
  const rate = (ok: number, total: number) => (total ? `${Math.round((ok / total) * 100)}%` : "—");

  return (
    <div style={{ minHeight: "100vh", background: "#08090D", color: "#E8E3D8" }}>
      <Navbar />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "6rem 1.5rem 4rem" }}>
        <span style={label}>Founder cockpit</span>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "2rem", margin: "0.5rem 0 1.5rem" }}>Daily numbers.</h1>
        {err && <p style={{ color: "#ff8a8a" }}>{err}</p>}
        {!stats && !err && <p style={sub}>Loading…</p>}
        {stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem" }}>
              <div style={box}>
                <div style={label}>Runs today</div>
                <div style={value}>{stats.today.runs}</div>
                <div style={sub}>{stats.today.delivered} delivered · {stats.today.failed} failed · {rate(stats.today.delivered, stats.today.delivered + stats.today.failed)} success</div>
              </div>
              <div style={box}>
                <div style={label}>Est. spend today</div>
                <div style={value}>{eur(stats.today.estSpendCents)}</div>
                <div style={sub}>7d: {eur(stats.last7d.estSpendCents)} over {stats.last7d.runs} runs</div>
              </div>
              <div style={box}>
                <div style={label}>Live now</div>
                <div style={value}>{stats.now.running}</div>
                <div style={sub}>running · {stats.now.queued} queued</div>
              </div>
              <div style={box}>
                <div style={label}>Users</div>
                <div style={value}>{stats.users.total}</div>
                <div style={sub}>{stats.users.paying} paying ({Object.entries(stats.users.byTier).map(([t, n]) => `${n} ${t}`).join(", ") || "none yet"})</div>
              </div>
              <div style={box}>
                <div style={label}>Minutes charged (7d)</div>
                <div style={value}>{stats.last7d.minutesCharged}</div>
                <div style={sub}>{stats.last7d.minutesReleased} refunded on failures</div>
              </div>
              <div style={box}>
                <div style={label}>Free tracks used</div>
                <div style={value}>{stats.freeTracksUsed}</div>
                <div style={sub}>all-time devices/IPs through the funnel</div>
              </div>
            </div>
            <p style={{ ...sub, marginTop: "2rem" }}>
              Errors &amp; stack traces → <a href="https://sentry.io" style={{ color: "#D6A84F" }}>Sentry</a> · Revenue →{" "}
              <a href="https://dashboard.stripe.com" style={{ color: "#D6A84F" }}>Stripe</a> · GPU spend →{" "}
              <a href="https://replicate.com/account/billing" style={{ color: "#D6A84F" }}>Replicate</a> ·{" "}
              <Link href="/dashboard" style={{ color: "#D6A84F" }}>Back to app dashboard</Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
