"use client";

import { useEffect, useRef, useState } from "react";
import { Store } from "@/lib/store";
import { Sync } from "@/lib/sync";
import { type TutorHealth, tutorEndpoint, tutorHealth } from "@/lib/tutor";
import styles from "./settings.module.css";

export default function Settings() {
  const [seen, setSeen] = useState(0);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [note, setNote] = useState("");
  const [tutor, setTutor] = useState<TutorHealth | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setSeen(Store.overall().seen);
    setUser(Sync.user);
  };
  useEffect(() => {
    refresh();
    void tutorHealth().then(setTutor);
    return Sync.subscribe(refresh);
  }, []);

  const exportJSON = () => {
    const b = new Blob([Store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "gmat-progress.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJSON = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        Store.importJSON(String(r.result));
        refresh();
        setNote("Progress imported.");
      } catch {
        setNote("Couldn't import that file.");
      }
    };
    r.readAsText(f);
  };

  return (
    <main className="wrap">
      <div className={styles.head}>
        <div className={styles.kick}>Settings</div>
        <h1>Settings</h1>
      </div>

      <h2 className={styles.sec}>Appearance</h2>
      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <b>Theme</b>
            <div className={styles.hint}>Also on the ☾ button in the top bar.</div>
          </div>
          <div className={styles.tools}>
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  document.documentElement.setAttribute("data-theme", t);
                  try { localStorage.setItem("gmat_theme", t); } catch {}
                }}
              >
                {t === "light" ? "☀ Light" : "☾ Dark"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h2 className={styles.sec}>Account</h2>
      <div className={styles.card}>
        {user ? (
          <div className={styles.row}>
            <div>
              <b>{user.email ?? "Account"}</b>
              <div className={styles.hint}>Progress syncs to the cloud on every answer.</div>
            </div>
            <button type="button" onClick={() => Sync.signOut()}>Sign out</button>
          </div>
        ) : (
          <div className={styles.row}>
            <div>
              <b>Guest</b>
              <div className={styles.hint}>
                Sign in to sync your progress across devices. As a guest, everything stays on this device.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                try { localStorage.removeItem("gmat_guest"); } catch {}
                location.href = "/";
              }}
            >
              Sign in
            </button>
          </div>
        )}
      </div>

      <h2 className={styles.sec}>AI tutor</h2>
      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <b>
              {tutor === null
                ? "Checking…"
                : tutor.reachable && tutor.configured
                  ? "Connected"
                  : tutor.reachable
                    ? "Server up, no API key"
                    : "Not reachable"}
            </b>
            <div className={styles.hint}>
              {tutor?.model ? `${tutor.model} · ` : ""}via {tutorEndpoint()}.
              {tutor && !tutor.configured && tutor.reachable
                ? " Set NVIDIA_API_KEY in .env.local (local) or the Vercel project's environment variables."
                : ""}
              {tutor && !tutor.reachable
                ? " Locally, start it with: node scripts/tutor-proxy.mjs"
                : ""}
            </div>
          </div>
          <button type="button" onClick={() => { setTutor(null); void tutorHealth().then(setTutor); }}>
            Re-check
          </button>
        </div>
        <div className={styles.hint} style={{ marginTop: 10 }}>
          The key lives on the server, never in the browser. Chats are not saved — they
          last as long as the tab.
        </div>
      </div>

      <h2 className={styles.sec}>Your data</h2>
      <div className={styles.card}>
        <div className={styles.hint} style={{ marginBottom: 10 }}>
          Saved on this device (localStorage) · {seen} questions tracked.
        </div>
        <div className={styles.tools}>
          <button type="button" onClick={exportJSON}>Export progress</button>
          <button type="button" onClick={() => fileRef.current?.click()}>Import</button>
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (confirm("Erase all saved progress on this device?")) {
                Store.reset();
                refresh();
                setNote("Progress reset.");
              }
            }}
          >
            Reset all
          </button>
          <input
            ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])}
          />
        </div>
        {note && <div className={styles.note}>{note}</div>}
      </div>

      <p className={styles.foot}>
        Personal, fair-use study tool · 910 questions across 3 books (Verbal + Quant).
        Nothing leaves your device unless you sign in.
      </p>
    </main>
  );
}
