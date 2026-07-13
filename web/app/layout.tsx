import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Boot from "@/components/Boot";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "GMAT Trainer",
  description: "Personal GMAT practice — Verbal + Quant, with on-device AI search.",
};

/* Set theme before first paint (saved choice wins, else OS preference).
   Same localStorage key as the vanilla app so the theme carries over. */
const themeInit = `try{var t=localStorage.getItem("gmat_theme");
if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";
document.documentElement.setAttribute("data-theme",t);}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <Boot />
        <header className="appbar">
          <Link href="/" className="brand" style={{ color: "inherit" }}>
            <span className="mk">G</span> GMAT Trainer
          </Link>
          <span className="sp" />
          <ThemeToggle />
          <Link href="/settings" className="themebtn" title="Settings" aria-label="Settings"
            style={{ display: "grid", placeItems: "center" }}>
            ⚙
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
