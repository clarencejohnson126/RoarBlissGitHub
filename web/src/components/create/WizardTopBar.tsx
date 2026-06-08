"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import styles from "./create.module.css";

/** Fixed corners on every wizard step: brand → home, and a Dashboard / profile link. */
export default function WizardTopBar() {
  return (
    <>
      <Link href="/" className={styles.wizHome} aria-label="Back to home">
        <span className={styles.wizLogo}>R</span>
        <span className={styles.wizWord}>ROAR<b>BLISS</b></span>
      </Link>
      <Link href="/dashboard" className={styles.wizDash}>
        <LayoutDashboard size={15} />
        <span>Dashboard</span>
      </Link>
    </>
  );
}
