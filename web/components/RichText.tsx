"use client";

import MathText from "./MathText";
import styles from "./RichText.module.css";

/* The tutor writes light markdown. Rather than pull in a parser, handle the four
   things it actually uses — **bold**, *italic*, bullet lists, numbered lists — and
   hand every run of text to MathText so inline $math$ still renders. Shared by the
   per-question tutor drawer and the standalone /tutor chat so both render replies
   identically. */
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    const k = `${key}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={k}><MathText text={part.slice(2, -2)} /></strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={k}><MathText text={part.slice(1, -1)} /></em>;
    }
    return <MathText key={k} text={part} />;
  });
}

export default function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${key}`} className={styles.list}>
        {bullets.map((b, i) => <li key={i}>{inline(b, `${key}-${i}`)}</li>)}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) { bullets.push(bullet[1]); return; }
    flush(String(i));
    if (line.trim()) out.push(<p key={`p-${i}`}>{inline(line, `p${i}`)}</p>);
  });
  flush("end");
  return <>{out}</>;
}
