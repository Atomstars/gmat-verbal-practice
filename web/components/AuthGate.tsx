"use client";

import { useEffect, useState } from "react";
import { Sync } from "@/lib/sync";
import styles from "./AuthGate.module.css";

/** Landing auth panel: email sign-in/register, Google, or continue as guest.
    Shown on Home until the user signs in or picks guest (remembered). */
export default function AuthGate({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return Sync.subscribe(() => {
      if (Sync.user) onDone();
    });
  }, [onDone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || pass.length < 6) {
      setMsg({ text: "Enter an email and a password of at least 6 characters.", err: true });
      return;
    }
    setBusy(true);
    setMsg({ text: tab === "register" ? "Creating your account…" : "Signing you in…" });
    const r =
      tab === "register" ? await Sync.signUpEmail(email, pass) : await Sync.signInEmail(email, pass);
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.msg ?? "That didn't work — please try again.", err: true }); return; }
    if (r.session) { onDone(); return; }
    setMsg({ text: r.msg ?? "Check your email to confirm your account, then sign in." });
    if (tab === "register") setTimeout(() => setTab("signin"), 400);
  };

  const guest = () => {
    try { localStorage.setItem("gmat_guest", "1"); } catch {}
    onDone();
  };

  return (
    <div className={styles.stage}>
      <div className={styles.logo}>
        GMAT <span>Trainer</span>
      </div>
      <div className={styles.card}>
        <h2>{tab === "register" ? "Create account" : "Welcome back"}</h2>
        <p className={styles.sub}>
          Sign in to sync your progress across devices — or continue as a guest.
        </p>
        <div className={styles.tabs}>
          <button className={tab === "signin" ? styles.on : ""} onClick={() => setTab("signin")} type="button">
            Sign in
          </button>
          <button className={tab === "register" ? styles.on : ""} onClick={() => setTab("register")} type="button">
            Register
          </button>
        </div>
        <form onSubmit={submit} className={styles.form}>
          <input
            type="email" placeholder="you@email.com" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password" placeholder="Password (6+ characters)"
            autoComplete={tab === "register" ? "new-password" : "current-password"}
            value={pass} onChange={(e) => setPass(e.target.value)}
          />
          <button type="submit" className={styles.primary} disabled={busy}>
            {tab === "register" ? "Create account →" : "Sign in →"}
          </button>
        </form>
        {msg && <div className={msg.err ? styles.msgErr : styles.msg}>{msg.text}</div>}
        <button type="button" className={styles.google} onClick={() => Sync.signInGoogle()}>
          Continue with Google
        </button>
        <button type="button" className={styles.guest} onClick={guest}>
          Continue as guest →
        </button>
      </div>
      <p className={styles.foot}>
        Personal, fair-use study tool · 910 questions across 3 books · progress saved on this device
      </p>
    </div>
  );
}
