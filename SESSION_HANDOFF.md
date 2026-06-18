# SESSION HANDOFF — resume here

Date: 2026-06-18. Branch: `master` at `afdd9eb`.

---

## TL;DR
1. **Supabase backend code** — **committed and pushed** to `master` on GitHub (`afdd9eb`).
   Local-first sync: Google OAuth sign-in, cloud progress merge, silent local fallback.
2. **Supabase project configured** — table `progress` with RLS created, Google provider
   enabled. Project ref: `bfaaczlxfafsxjnqqvoc` (Seoul).
3. **Google OAuth configured** — Google Cloud project `GMAT`, OAuth client created with
   redirect URI pointing to Supabase callback.
4. **Google sign-in NOT yet verified end-to-end** — first attempt returned "provider not
   enabled"; provider was re-saved but not re-tested. This is the top priority.
5. **APP_GUIDE.md + updated HANDOFF.md** — committed with the Supabase work.
6. **Vercel deploy still potentially stalled** — not re-checked this session.

---

## What was done this session
- Walked through all 6 Supabase + Google OAuth setup steps:
  1. Created Supabase project `GMAT` (ref: `bfaaczlxfafsxjnqqvoc`, Seoul)
  2. Created `progress` table with RLS policy (`auth.uid() = user_id`)
  3. Created Google OAuth client in Google Cloud Console (project `GMAT`)
     - Client ID: (see Google Cloud Console → Credentials)
     - Redirect URI: `https://bfaaczlxfafsxjnqqvoc.supabase.co/auth/v1/callback`
  4. Enabled Google provider in Supabase Auth with Client ID + Secret
  5. Whitelisted redirect URLs: `http://localhost:8754` + `https://gmat-prep-ivory.vercel.app`
  6. Pasted Supabase URL + anon key into `index.html` config block
- Committed and pushed: `afdd9eb "Add Supabase backend: Google login + cross-device
  progress sync (local-first)"`

---

## What's NOT done / needs attention

### 1. Google sign-in flow (TOP PRIORITY)
First click returned `{"code":400,"error_code":"validation_failed","msg":"Unsupported
provider: provider is not enabled"}`. The user re-saved the Google provider toggle in
Supabase. **Not re-tested.** To debug:
- Supabase dashboard → Authentication → Providers → Google: confirm toggle is ON,
  Client ID and Secret are filled, and click Save again.
- Test by visiting: `https://bfaaczlxfafsxjnqqvoc.supabase.co/auth/v1/authorize?provider=google&redirect_to=http://localhost:8754/`
- If it still fails, the Google Cloud OAuth consent screen is in **Testing** mode —
  only `govada.akash@gmail.com` (added as a test user) can sign in. If the user's
  browser is signed into a different Google account, it will fail.
- The Client Secret can't be re-viewed in Google Cloud after the dialog was closed.
  If needed, create a new one in Google Cloud Console → Credentials.

### 2. Two-device sync test
Once sign-in works: sign in on two browser profiles, answer in one, reload the other.
The `mergeProgress` function takes max(attempts, correct), latest timestamps, max streak.

### 3. Vercel deploy
Previous session's deploys all stalled (UNKNOWN status, empty build logs). Suspected
account-level hold. Check Vercel dashboard → `gmat-prep` → any banners. After
unblocking, `vercel --prod` or just let the GitHub push auto-deploy.
Live URL: https://gmat-prep-ivory.vercel.app

### 4. CR sub-type tuning (low priority)
21/182 CR questions are `"Unclassified"` — `_OG_CR_RULES` in `parser.py` can be tuned.

---

## How to run locally
```bash
cd "C:\Claude Code Projects\GMAT"
python -m http.server 8754      # then open http://localhost:8754
```

---

## Key config values (all public-safe)
| What | Value |
|---|---|
| Supabase URL | `https://bfaaczlxfafsxjnqqvoc.supabase.co` |
| Supabase anon key | `eyJhbGciOiJIUzI1NiIs...QTzwq_FLSKJ_EUUGf2SsWGRAcIOKWiOUndljS9huc_c` |
| Google OAuth Client ID | (see Google Cloud Console → Credentials) |
| Google OAuth Client Secret | (see Google Cloud Console → Credentials) |
| Supabase table | `progress` (uuid PK → jsonb `data` + `updated_at`, RLS on) |
| Redirect URLs (Supabase) | `http://localhost:8754`, `https://gmat-prep-ivory.vercel.app` |
| GitHub repo | `github.com/Atomstars/gmat-verbal-practice` (private) |
| Vercel project | `gmat-prep` → `gmat-prep-ivory.vercel.app` |
