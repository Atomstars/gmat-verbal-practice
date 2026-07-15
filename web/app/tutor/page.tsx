import Link from "next/link";
import Icon from "@/components/Icon";
import styles from "@/components/Premium.module.css";

export default function TutorPage() {
  return (
    <main className="wrap">
      <div className={styles.hero}>
        <span className={styles.badge}>PREMIUM</span>
        <div className={styles.mark}><Icon name="graduate" size={30} /></div>
        <h1 className={styles.title}>Tutor</h1>
        <p className={styles.lede}>
          A live AI tutor that sits with you through a question — walks the reasoning,
          answers &quot;why is B wrong?&quot;, and adapts to how <em>you</em> think, not a script.
        </p>
        <div className={styles.soon}>
          <Icon name="sparkle" size={14} /> Launching soon
        </div>
        <Link href="/" className={styles.back}>← Back to home</Link>
      </div>
    </main>
  );
}
