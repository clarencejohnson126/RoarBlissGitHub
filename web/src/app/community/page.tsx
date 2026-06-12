import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import CommunityWall from "./CommunityWall";
import styles from "./community.module.css";

export const metadata: Metadata = {
  title: "The Wall — Roar Bliss Community",
  description:
    "Real battle speeches, posted by the people they were made for. Listen to the community's roars — then create your own.",
};

export default function CommunityPage() {
  return (
    <div className={styles.wrap}>
      <Navbar />
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>The Wall</span>
          <h1 className={styles.h1}>
            Their story. Their battle. <span className={styles.gold}>Their roar.</span>
          </h1>
          <p className={styles.sub}>
            Real speeches, posted by the people they were made for. Listen — then add your own to the wall.
          </p>
        </div>
        <CommunityWall />
      </div>
    </div>
  );
}
