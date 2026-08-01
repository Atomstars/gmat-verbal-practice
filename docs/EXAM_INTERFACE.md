# Exam interface — GMAT Focus test-delivery replica

Every practice session in the Next.js app (`web/`) now runs inside a replica of the
GMAT Focus Edition test-delivery screen, not a study-app quiz view. Timed or untimed,
Verbal or Quant, practice or full-length: the same interface. Only the score report
afterwards uses the normal app theme.

Added 2026-07-31.

## Where it lives

| File | What it holds |
|---|---|
| `web/app/practice/page.tsx` | The whole section runtime: stages, Next→Confirm, bookmarks, Question Review & Edit, section end, report |
| `web/app/practice/practice.module.css` | The exam chrome (header band, footer band, directions/review/complete sheets, help dialog) + report styles |
| `web/components/QuestionCard.tsx` + `.module.css` | The test screen itself: radio-button choice list, split passage/question panes |
| `web/app/globals.css` | `body[data-exam]` — hides the site header and locks page scroll while a section is live |

## What is mirrored from the real exam

- **Full-screen takeover.** The site header and nav disappear for the duration of a
  section; the exam surface is `position: fixed` over the viewport.
- **Fixed light "testing centre" skin, Arial.** It ignores the app's dark theme
  on purpose — the real test has one appearance.
- **Header band**: section name (Verbal Reasoning / Quantitative Reasoning / Mixed
  Section, derived from the question types in the pool) · `Time Remaining` with a
  **Hide/Show** toggle · `Question N of M`.
- **Section directions screen** before timed and exam-like sections, with the
  question count, time limit, edit allowance, and the rules. The clock starts on
  **Begin Section**.
- **The question screen**: no metadata, no choice letters, no cards — a stem and a
  column of radio buttons. Reading passages sit in a left-hand pane, split by a hard
  rule, scrolling independently of the question.
- **Two-step answer locking**: select → **Next** → **Confirm**. You cannot advance
  without an answer (Next is disabled), which is how the real section behaves.
- **Bookmark** on any question (the exam's flag), shown on the review screen and in
  the report.
- **Question Review & Edit**: a table of every question in the section with
  answered/not-answered status and bookmark, click to jump back. In exam-like modes
  you may change up to **3 confirmed answers** (`EDIT_LIMIT`), the real GMAT Focus
  allowance; after that, answered questions are read-only.
- **Help** dialog and an **End Section** exit, then a **Section Complete** screen
  before the report.
- **Keyboard**: `1`–`5` select · `Enter` Next/Confirm · `B` bookmark · `R` review ·
  `Esc` close.

## Where it deliberately differs

- **Practice modes still teach.** In practice / redo / daily, confirming an answer
  reveals right-vs-wrong, the sub-type, the explanation, and the AI "similar
  questions" panel — inside the exam surface, below the choices. Exam modes
  (`mode=exam`, `mode=gmatfocus`) reveal nothing until the report, like the real test.
- **Choice letters appear only after an answer is confirmed.** The real screen has
  none; the book explanations name a letter, so they come back post-answer.
- **Untimed sections** show a count-up clock labelled `Time` instead of
  `Time Remaining`. The real exam is always timed.
- **No calculator** — on the real test it exists only in Data Insights, which this
  app's banks don't cover.
- **No GMAC branding or logos.** The layout and interaction model are replicated;
  the marks are not.
- **Mobile** stacks the passage above the question (the real exam is desktop-only).
- **Question Review & Edit opens at any time.** On the real exam it is an
  end-of-section screen: you answer forward through the section, then review and edit
  up to three answers with whatever time is left. Ours is reachable from the footer
  mid-section, which is friendlier for practice. The 3-edit cap still applies in exam
  modes.
- **End Section exists.** The real exam has no early exit — you finish the section or
  the clock does it for you. Ours is on the review screen and in Help so a practice
  session isn't a trap.

## Split-screen geometry (fixed 2026-08-01)

The passage and question panes are **exact halves** of the viewport, each with its own
scrollbar, matching the real RC screen. The first cut looked lopsided because the
question surface was a shrink-to-fit flex child of the exam body, so the 50% panes
resolved against content width instead of the screen. `.shell` now stretches
(`flex: 1; width: 100%`) and each pane centres a ~660px text column: measured 950/950
at 1900px wide and 640/640 at 1280px.

## Behaviour worth knowing

- **Attempts are written once.** Exam-like sections keep answers in memory and record
  them to `Store` / Supabase at *section end*, so using an edit doesn't double-count an
  attempt. Practice modes still record on confirm, as before.
- **`mode=gmatfocus` is now feedback-free** and edit-limited, matching the adaptive
  section it simulates. The adaptive engine still only serves a new question from the
  frontier, so going back through Question Review never changes the served sequence.
- **The session ends** on the last question, on `End Section`, or when the countdown
  reaches zero — all three land on Section Complete, then the report.
