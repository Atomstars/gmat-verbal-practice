import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import Boot from "@/components/Boot";
import NavBar from "@/components/NavBar";
import ThemeToggle from "@/components/ThemeToggle";

/* IBM Plex — drawn for technical/testing interfaces, which is exactly the
   register this app wants: Sans for UI chrome, Serif for reading passages
   (an authoritative "printed page" feel), Mono for timers and question counts. */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-plex-serif",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexSerif.variable} ${plexMono.variable}`}
    >
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
        <NavBar />
        {children}
      </body>
    </html>
  );
}
