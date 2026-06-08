"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import styles from "./LoginButton.module.css";

/**
 * Standalone auth control for any navbar: a "Login" button that opens a side popup (email + password,
 * create-account toggle, forgot-password link) — no page change. When signed in it shows Dashboard +
 * Sign out. Password login via Supabase; magic-link kept only as the "forgot password" fallback.
 */
export default function LoginButton() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setEmail(data.session?.user?.email ?? "");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSignedIn(!!s);
      if (s?.user?.email) setEmail(s.user.email);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || pw.length < 8) {
      setMsg("Enter your email and a password (at least 8 characters).");
      return;
    }
    setBusy(true);
    setMsg(mode === "register" ? "Creating your account…" : "Signing in…");
    try {
      if (mode === "register") {
        const r = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: pw }),
        });
        const j = await r.json();
        if (!r.ok) {
          setMsg(j.exists ? "That email already has an account — switch to Sign in." : j.error || "Could not create the account.");
          setBusy(false);
          return;
        }
      }
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
      if (error) {
        setMsg(/invalid/i.test(error.message) ? "Wrong email or password." : error.message);
        setBusy(false);
        return;
      }
      setOpen(false);
      setPw("");
      setMsg("");
    } catch {
      setMsg("Network error — please try again.");
    }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email.includes("@")) {
      setMsg("Enter your email first, then tap forgot password.");
      return;
    }
    setMsg("Sending a one-time sign-in link…");
    try {
      const r = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: typeof window !== "undefined" ? window.location.href : undefined }),
      });
      const j = await r.json();
      setMsg(r.ok ? "Check your email for a one-time link, then set a new password in Settings." : j.error || "Could not send the link.");
    } catch {
      setMsg("Network error — please try again.");
    }
  };

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    setSignedIn(false);
  };

  if (signedIn) {
    return (
      <div className={styles.wrap}>
        <Link href="/dashboard" className={styles.trigger}>Dashboard</Link>
        <button className={styles.signout} onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.trigger} onClick={() => { setOpen(true); setMsg(""); }}>
        Login
      </button>
      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Sign in">
            <div className={styles.head}>
              <span className={styles.title}>{mode === "register" ? "Create account" : "Welcome back"}</span>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit}>
              <label className={styles.label}>Email</label>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" autoFocus />
              <label className={styles.label}>Password</label>
              <input className={styles.input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoComplete={mode === "register" ? "new-password" : "current-password"} />
              <button className={styles.submit} type="submit" disabled={busy}>
                {busy ? "…" : mode === "register" ? "Create account" : "Sign in"}
              </button>
            </form>
            <div className={styles.row}>
              {mode === "signin" ? (
                <button className={styles.link} onClick={() => { setMode("register"); setMsg(""); }}>Create account</button>
              ) : (
                <button className={styles.link} onClick={() => { setMode("signin"); setMsg(""); }}>Have an account?</button>
              )}
              <button className={styles.link} onClick={forgot}>Forgot password?</button>
            </div>
            {msg && <p className={styles.msg}>{msg}</p>}
          </div>
        </>
      )}
    </div>
  );
}
