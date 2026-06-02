"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Compact auth + credits widget for the header.
 * - Logged out: email → magic-link sign-in.
 * - Logged in: shows email + paid-credit balance + a Stripe (TEST) "buy" button.
 */
export default function AccountPanel() {
  const [email, setEmail] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "busy">("idle");
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSignedInEmail(null);
      setCredits(0);
      return;
    }
    try {
      const r = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (j.authenticated) {
        setSignedInEmail(j.email);
        setCredits(j.credits ?? 0);
      } else {
        setSignedInEmail(null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabaseBrowser().auth.onAuthStateChange(() => refresh());
    // Clean up the magic-link hash from the URL after the session is captured.
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setPhase("sending");
    setMsg("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) {
      setMsg(error.message);
      setPhase("idle");
    } else {
      setPhase("sent");
      setMsg("Check your email for the magic link.");
    }
  };

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    setSignedInEmail(null);
    setCredits(0);
  };

  const buy = async () => {
    setPhase("busy");
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (j.url) {
        window.location.href = j.url;
      } else {
        setMsg(j.error || "Checkout failed");
        setPhase("idle");
      }
    } catch (err) {
      setMsg(String(err));
      setPhase("idle");
    }
  };

  if (signedInEmail) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.8rem" }}>
        <span
          title={signedInEmail}
          style={{
            color: "var(--color-gold)",
            background: "rgba(255,215,0,0.08)",
            border: "1px solid rgba(255,215,0,0.2)",
            padding: "0.25rem 0.55rem",
            borderRadius: "20px",
            fontWeight: 600,
          }}
        >
          ⚡ {credits} credit{credits === 1 ? "" : "s"}
        </span>
        <button
          onClick={buy}
          disabled={phase === "busy"}
          className="btn-premium btn-gold"
          style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem", minBlockSize: "auto" }}
        >
          {phase === "busy" ? "…" : "Buy 5 (€5 test)"}
        </button>
        <button
          onClick={signOut}
          style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "0.75rem", textDecoration: "underline" }}
        >
          sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={signIn} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={phase === "sent" ? msg : "you@email.com"}
        title={msg}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--color-obsidian-border)",
          borderRadius: "6px",
          padding: "0.3rem 0.55rem",
          color: "var(--color-text-primary)",
          fontSize: "0.78rem",
          width: phase === "sent" ? "210px" : "150px",
        }}
        disabled={phase === "sent"}
      />
      {phase !== "sent" && (
        <button
          type="submit"
          disabled={phase === "sending"}
          className="btn-premium btn-secondary"
          style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem", minBlockSize: "auto" }}
        >
          {phase === "sending" ? "…" : "Sign in"}
        </button>
      )}
    </form>
  );
}
