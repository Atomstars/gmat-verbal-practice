import Link from "next/link";
import Icon, { type IconName } from "./Icon";
import styles from "./SectionTile.module.css";

export type Accent = "blue" | "teal" | "violet" | "amber" | "green" | "gold";

/** Section/menu tile: icon badge + title only — no description paragraph. */
export default function Tile({
  href, icon, title, count, feature, accent = "blue", badge,
}: {
  href: string;
  icon: IconName;
  title: string;
  count?: string;
  feature?: boolean;
  accent?: Accent;
  badge?: string;
}) {
  return (
    <Link href={href} className={`${styles.tile} ${feature ? styles.feature : ""} ${accent === "gold" ? styles.gold : ""}`}>
      <span className={`${styles.icon} ${styles["ac-" + accent]}`}>
        <Icon name={icon} size={19} />
      </span>
      <span className={styles.title}>{title}</span>
      {badge && <span className={styles.premiumBadge}>{badge}</span>}
      {count && <span className={styles.count}>{count}</span>}
    </Link>
  );
}
