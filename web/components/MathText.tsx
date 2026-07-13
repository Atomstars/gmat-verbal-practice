"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, useMemo } from "react";

/**
 * Renders text containing inline $math$ segments with KaTeX.
 * Prose stays plain text (never italicised as math) — mirrors the vanilla
 * app's auto-render with inline-only delimiters.
 */
export default function MathText({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\$[^$]+\$)/g), [text]);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          let html = "";
          try {
            html = katex.renderToString(part.slice(1, -1), {
              throwOnError: false,
              displayMode: false,
            });
          } catch {
            return <Fragment key={i}>{part}</Fragment>;
          }
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/** Multi-paragraph text (passages, stems, explanations) with math support. */
export function MathParas({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i} className={className}>
          <MathText text={para} />
        </p>
      ))}
    </>
  );
}
