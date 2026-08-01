# GMAT Trainer — web app

Next.js (App Router, React 19, TypeScript) front end for the question banks at the
repo root. This is the deploy target: `next.config.ts` sets `output: "export"` and
Vercel serves `web/out` (see the comment in that file for why).

```bash
npm run dev      # predev copies questions*.json / embeddings.json / diagrams into public/data
npm run build    # static export to web/out
```

Run it from the repo root via the preview config `gmat-web`, or `npm run dev --prefix web`.

## Layout

```
app/          routes: / · verbal · quant · fulllength · setup · practice · history · dashboard · analyzer · tutor · settings
components/   QuestionCard (the test screen), NavBar, SmartSearch, MathText (KaTeX), AuthGate…
lib/          banks (data load) · store (localStorage) · sync (Supabase) · adaptive · daily · order · vector (transformers.js)
scripts/      sync-data.mjs — copies the root data files into public/
```

## The section runtime

`app/practice/page.tsx` is every mode — practice, redo, daily, exam, gmatfocus — and it
renders a **replica of the GMAT Focus test-delivery interface**: full-screen light
chrome, section directions, radio-button choices, Next→Confirm locking, Bookmark,
Question Review & Edit, Section Complete, then the report.

An **✦ Ask AI** button in that screen (and on the report) opens the tutor drawer —
`components/TutorPanel.tsx` + `lib/tutor.ts`, talking to the proxy in `../api/tutor.js`
(locally: `node ../scripts/tutor-proxy.mjs`). See
**[../docs/AI_TUTOR.md](../docs/AI_TUTOR.md)**.

Read **[../docs/EXAM_INTERFACE.md](../docs/EXAM_INTERFACE.md)** before changing it — it
records what is mirrored from the real exam, what deliberately differs (practice
feedback, choice letters after answering, untimed clock), and why exam-mode attempts
are recorded only at section end.

Deeper reference: [../CLAUDE.md](../CLAUDE.md) (parsers, schema, app architecture) and
[../HANDOFF.md](../HANDOFF.md) (status, open items).
