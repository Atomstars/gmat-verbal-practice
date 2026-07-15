"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import NavDropdown from "./NavDropdown";
import styles from "./NavBar.module.css";

const PRACTICE_ITEMS = [
  { href: "/verbal", label: "Verbal", hint: "RC + CR" },
  { href: "/quant?type=PS", label: "Quant", hint: "Problem Solving" },
  { href: "/quant?type=DS", label: "Data Sufficiency", hint: "DS" },
];

const TESTS_ITEMS = [
  { href: "/setup?types=RC,CR,PS,DS&mode=exam&order=shuffle&title=Full-length%20Test", label: "Full-length Test", hint: "All sections · 45 min" },
  { href: "/practice?mode=exam&types=RC,CR,PS,DS&order=shuffle&timed=1&limit=1200&n=12&title=Mini%20Test", label: "Mini Test", hint: "Quick · 20 min" },
  { href: "/setup?types=RC,CR&mode=exam&order=shuffle&title=Verbal%20Sectional", label: "Verbal Sectional", hint: "RC + CR only" },
  { href: "/setup?types=PS,DS&mode=exam&order=shuffle&title=Quant%20Sectional", label: "Quant Sectional", hint: "PS + DS only" },
];

const REVIEW_ITEMS = [
  { href: "/setup?mode=redo&title=Review%20%C2%B7%20All%20Mistakes", label: "All mistakes" },
  { href: "/setup?types=RC,CR&mode=redo&title=Review%20%C2%B7%20Verbal", label: "Verbal" },
  { href: "/setup?types=PS&mode=redo&title=Review%20%C2%B7%20Quant", label: "Quant" },
  { href: "/setup?types=DS&mode=redo&title=Review%20%C2%B7%20Data%20Sufficiency", label: "Data Sufficiency" },
  { href: "/practice?mode=redo&order=shuffle&title=Review%20%C2%B7%20Shuffled", label: "Shuffle all", hint: "Skip setup" },
  { href: "/practice?mode=redo&timed=1&limit=1800&title=Review%20%C2%B7%20Timed%20Retest", label: "Timed retest", hint: "30 min" },
];

function NavLinks() {
  const pathname = usePathname();
  const search = useSearchParams();

  /* the exam runner gets a full-screen, distraction-free treatment (see
     practice.module.css) — no persistent nav while a session is live */
  if (pathname.startsWith("/practice")) return null;

  const practiceActive = pathname === "/verbal" || pathname === "/quant";
  const testsActive = pathname === "/fulllength";
  const reviewActive = pathname === "/setup" && search.get("mode") === "redo";

  return (
    <nav className={styles.nav}>
      <div className={styles.navIn}>
        <Link href="/" className={`${styles.link} ${pathname === "/" ? styles.on : ""}`}>Home</Link>
        <NavDropdown label="Practice" items={PRACTICE_ITEMS} active={practiceActive} />
        <NavDropdown label="Tests" items={TESTS_ITEMS} active={testsActive} />
        <NavDropdown label="Review" items={REVIEW_ITEMS} active={reviewActive} />
        <Link href="/tutor" className={`${styles.link} ${styles.premium} ${pathname === "/tutor" ? styles.on : ""}`}>
          Tutor
        </Link>
        <Link href="/analyzer" className={`${styles.link} ${styles.premium} ${pathname === "/analyzer" ? styles.on : ""}`}>
          Analyzer
        </Link>
        <Link href="/dashboard" className={`${styles.link} ${pathname === "/dashboard" ? styles.on : ""}`}>
          Dashboard
        </Link>
      </div>
    </nav>
  );
}

export default function NavBar() {
  return (
    <Suspense fallback={null}>
      <NavLinks />
    </Suspense>
  );
}
