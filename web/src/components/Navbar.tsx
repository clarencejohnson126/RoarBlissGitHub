"use client";

import React, { useState } from "react";
import Link from "next/link";
import AccountPanel from "@/components/AccountPanel";

const LINKS = [
  { label: "Features", href: "/#personalization" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Templates", href: "/#templates" },
  { label: "Pricing", href: "/pricing" },
  { label: "Dashboard", href: "/dashboard" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav-bar">
      <div className="nav-inner" style={{ position: "relative" }}>
        <Link
          href="/"
          className="brand-mark"
          style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}
        >
          <span
            aria-hidden
            style={{
              width: 32, height: 32, borderRadius: "50%",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, var(--color-gold), var(--color-gold-deep))",
              color: "#1a130a", fontFamily: "var(--font-serif)", fontWeight: 800, fontSize: "1.05rem",
              boxShadow: "0 0 14px rgba(214,168,79,0.45)",
            }}
          >
            R
          </span>
          <span>ROAR<span className="bm-gold">BLISS</span></span>
        </Link>

        <nav className={`nav-links${open ? " open" : ""}`}>
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="nav-link" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <div onClick={() => setOpen(false)} style={{ display: "flex", alignItems: "center" }}>
            <AccountPanel />
          </div>
          <Link
            href="/create"
            className="btn-premium btn-gold"
            style={{ padding: "0.6rem 1.4rem", minBlockSize: "auto", fontSize: "0.8rem", textDecoration: "none" }}
            onClick={() => setOpen(false)}
          >
            Get Started
          </Link>
        </nav>

        <button className="nav-burger" aria-label="Toggle menu" onClick={() => setOpen((o) => !o)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>
    </header>
  );
}
