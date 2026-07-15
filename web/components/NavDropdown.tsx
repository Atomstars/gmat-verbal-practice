"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import styles from "./NavBar.module.css";

export interface DropItem {
  href: string;
  label: string;
  hint?: string;
}

/** A nav-bar item that opens a small panel of related links on click.
    The panel is portaled to <body> and positioned with `fixed` coordinates —
    the nav row needs `overflow-x: auto` for mobile scrolling, and per the
    CSS overflow spec that forces overflow-y to clip too, which would cut off
    an in-place absolutely-positioned panel. Portaling escapes that clip. */
export default function NavDropdown({
  label, items, active,
}: {
  label: string;
  items: DropItem[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const inside = (target: Node) =>
      wrapRef.current?.contains(target) || panelRef.current?.contains(target);
    const onClick = (e: MouseEvent) => {
      if (!inside(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  };

  return (
    <div className={styles.dropWrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.link} ${active ? styles.on : ""}`}
        onClick={toggle}
        aria-expanded={open}
      >
        {label}
        <Icon name="chevronDown" size={12} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className={styles.panel} style={{ position: "fixed", top: pos.top, left: pos.left }}>
          {items.map((it) => (
            <Link key={it.href} href={it.href} className={styles.panelItem}>
              {it.label}
              {it.hint && <span className={styles.panelHint}>{it.hint}</span>}
            </Link>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
