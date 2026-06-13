"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import LoginButton from "@/components/LoginButton";

const LINKS = [
  { label: "Pricing", href: "/pricing" },
  { label: "The Wall", href: "/community" },
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
          <Image
            src="/images/logo-symbol.png"
            alt=""
            width={52}
            height={52}
            aria-hidden
            style={{ display: "block" }}
          />
          <span>ROAR<span className="bm-gold">BLISS</span></span>
          <span
            aria-label="Beta"
            style={{
              fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "0.12rem 0.4rem", borderRadius: "999px", lineHeight: 1,
              background: "rgba(212,175,55,0.18)", color: "var(--bm-gold, #d4af37)",
              border: "1px solid rgba(212,175,55,0.45)", alignSelf: "flex-start", marginTop: "0.1rem",
            }}
          >
            Beta
          </span>
        </Link>

        <nav className={`nav-links${open ? " open" : ""}`}>
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="nav-link" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <div style={{ display: "flex", alignItems: "center" }}>
            <LoginButton />
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
