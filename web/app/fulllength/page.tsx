"use client";

import Tile from "@/components/SectionTile";
import styles from "../page.module.css";

export default function FullLengthPage() {
  return (
    <main className="wrap">
      <div className={styles.hero}>
        <div className={styles.kick}>Section</div>
        <h1>Tests</h1>
      </div>
      <h2 className={styles.sec}>Timed practice</h2>
      <div className={styles.grid}>
        <Tile href="/setup?types=RC,CR,PS,DS&mode=exam&order=shuffle&title=Full-length%20Test"
          icon="clock" accent="amber" title="Full-length Test" feature />
        <Tile href="/practice?mode=exam&types=RC,CR,PS,DS&order=shuffle&timed=1&limit=1200&n=12&title=Mini%20Test"
          icon="zap" accent="teal" title="Mini Test" />
        <Tile href="/setup?types=RC,CR&mode=exam&order=shuffle&title=Verbal%20Sectional"
          icon="book" accent="blue" title="Verbal Sectional" />
        <Tile href="/setup?types=PS,DS&mode=exam&order=shuffle&title=Quant%20Sectional"
          icon="bars" accent="violet" title="Quant Sectional" />
        <Tile href="/setup?types=RC,CR,PS,DS&order=shuffle&title=Random%20Mix"
          icon="shuffle" accent="green" title="Random Mix" />
      </div>
    </main>
  );
}
