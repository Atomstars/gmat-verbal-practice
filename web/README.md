# GMAT Trainer — web app

Next.js (App Router, React 19, TypeScript) frontend. It retains the existing visual
design and calls the Java Spring Boot API without downloading answer keys or corpus
embeddings.

```bash
npm run dev      # predev copies public diagrams only
npm run build    # static production build
```

Run it from the repo root via the preview config `gmat-web`, or `npm run dev --prefix web`.

## Layout

```
app/          routes: / · verbal · quant · fulllength · setup · practice · history · dashboard · analyzer · tutor · settings
components/   QuestionCard (the test screen), NavBar, SmartSearch, MathText (KaTeX), AuthGate…
lib/          typed Java API client · guest/cache store · Supabase Auth sync
scripts/      sync-data.mjs — copies public diagram assets only
```

## The section runtime

`app/practice/page.tsx` is every mode — practice, redo, daily, exam, gmatfocus — and it
renders a **replica of the GMAT Focus test-delivery interface**: full-screen light
chrome, section directions, radio-button choices, Next→Confirm locking, Bookmark,
Question Review & Edit, Section Complete, then the report.

An **✦ Ask AI** button in that screen (and on the report) opens the tutor drawer —
`components/TutorPanel.tsx` + `lib/tutor.ts`, talking to the protected Java tutor
endpoint. See
**[../docs/AI_TUTOR.md](../docs/AI_TUTOR.md)**.

Read **[../docs/EXAM_INTERFACE.md](../docs/EXAM_INTERFACE.md)** before changing it — it
records what is mirrored from the real exam, what deliberately differs (practice
feedback, choice letters after answering, untimed clock), and why exam-mode attempts
are recorded only at section end.

Deeper reference: [../CLAUDE.md](../CLAUDE.md) (parsers, schema, app architecture) and
[../HANDOFF.md](../HANDOFF.md) (status, open items).
