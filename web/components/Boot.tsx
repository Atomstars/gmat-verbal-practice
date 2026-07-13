"use client";

import { useEffect } from "react";
import { setStoreOnChange } from "@/lib/store";
import { Attempts, Sync } from "@/lib/sync";

/** One-time client boot: wire Store→Sync pushes, restore session, device identity. */
export default function Boot() {
  useEffect(() => {
    setStoreOnChange((d) => Sync.onLocalChange(d));
    void Sync.init();
    void Attempts.init();
  }, []);
  return null;
}
