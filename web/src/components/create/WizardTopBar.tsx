"use client";

import Link from "next/link";
import Image from "next/image";
import LoginButton from "@/components/LoginButton";
import styles from "./create.module.css";

/** Fixed corners on every wizard step: brand → home, and the Login / account control. */
export default function WizardTopBar() {
  return (
    <>
      <Link href="/" className={styles.wizHome} aria-label="Back to home">
        <Image src="/images/logo-symbol.png" alt="" width={40} height={40} style={{ display: "block", flexShrink: 0 }} />
        <span className={styles.wizWord}>ROAR<b>BLISS</b></span>
      </Link>
      <div style={{ position: "fixed", top: "0.85rem", right: "clamp(1rem, 4vw, 2rem)", zIndex: 60 }}>
        <LoginButton />
      </div>
    </>
  );
}
