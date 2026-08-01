import TutorChat from "@/components/TutorChat";
import styles from "@/components/Premium.module.css";

export default function TutorPage() {
  return (
    <main className="wrap">
      <div className={styles.pageHead}>
        <span className={styles.badge}>AI</span>
        <h1 className={styles.pageTitle}>Tutor</h1>
        <p className={styles.pageLede}>
          Ask about any GMAT concept or strategy — no question needs to be open.
          For help on one you&apos;re solving, use ✦ Ask AI on the question screen instead.
        </p>
      </div>
      <TutorChat />
    </main>
  );
}
