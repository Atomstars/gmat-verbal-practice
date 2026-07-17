"use client";

import { useRouter, usePathname } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/") return null; // nothing to go back to from home

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <button className="themebtn" type="button" onClick={goBack} title="Back" aria-label="Back">
      ←
    </button>
  );
}
