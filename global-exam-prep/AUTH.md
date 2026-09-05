# Auth setup (students)

**Student identity is Supabase Auth** (email + password, Google OAuth, password
recovery); the profile row is `public.students`, created by a database trigger.
**Signup's 6-digit code is generated, stored and verified by this app's server**, not
by the browser and not by Supabase: `/api/send-otp` mints it, keeps only a keyed digest
in `public.auth_otp`, mails it (Nodemailer + Gmail), and `/api/verify-otp` checks it.
The account is created only after that check passes, so Supabase never mails a signup
code and the raw code never appears in a client-generated request. **Everything else is still Firebase**: Firestore data (exams,
syllabus, dashboard, analytics, feedback), Storage, and the exam-history documents —
see §10 for what that split costs until the two identities are bridged. Role-based
route guards are unchanged.

## 1. Firebase console checklist

| Setting | Where | Value |
| --- | --- | --- |
| Email/Password provider | Authentication → Sign-in method | **Enabled** |
| Google provider | Authentication → Sign-in method | **Enabled** |
| Authorised domains | Authentication → Settings → Authorised domains | `localhost`, your Vercel domain (`*.vercel.app`), and your production domain |
| Firestore | Build → Firestore Database | Created (production mode) |
| Rules | Build → Firestore → Rules | Deploy `global-exam-prep/firestore.rules` |

> **Email/Password must stay enabled even if you only use Google.** Registration
> creates a real Firebase Auth user; blocking it with "email enumeration
> protection" will surface as `auth/operation-not-allowed`.

## 2. Environment

Copy `global-exam-prep/.env.example` → `global-exam-prep/.env.local`.

| Variable | Used by | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `src/supabase.js` | Project URL, `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/supabase.js` | The publishable (`sb_publishable_…`) key. There is **no** `VITE_SUPABASE_SECRET_KEY`: `src/supabase.js` refuses to boot if the value looks like a `sb_secret_…` key or a service-role JWT. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | `api/send-otp.js` | **Required for signup.** A Gmail account with a 16-char *App Password* (not the account password). Missing them ⇒ the endpoint returns 500 and signup shows "Email service not configured…". |

Vite bakes `VITE_*` at build time, so changing either value needs a redeploy.

## 3. Deploy the rules

```bash
cd global-exam-prep
npm i -g firebase-tools
firebase login
firebase use --add          # pick the project; name the alias "default"
npm run deploy:rules        # = firebase deploy --only firestore:rules
```

`firebase use --add` is not optional: `firebase.json` carries no `projects`
field, so without an active alias the deploy targets nothing.

This step is **required**. The client cannot read or write `students`, `meta` or
`otp_tokens` without it, and signup fails with *"the database rules blocked this
action"*.

## 4. Shape of a student document

`students/{firebaseUid}` — collection named `students` per
`SRS/ER_Diagram_last_updated_25_8.jpg` (`Students` entity):

```jsonc
{
  "studentId": 1,                    // ER: StudentId (auto-increment, from meta/counters)
  "uid":         "…",                // Firebase Auth UID, == document id
  "fullName":    "Raja Advani",      // ER: FullName
  "email":       "raja@x.com",       // ER: Email, lowercase
  "passwordHash": "pbkdf2$210000$…", // ER: Password — salted digest, never plaintext
  "isSpam":      false,              // ER: IsSpam
  "role":        "student",          // 'student' | 'admin' | 'superAdmin'
  "provider":    "email",            // 'email' | 'google'
  "providers":   ["email"],
  "createdAt":   "2026-09-03T03:10:00.000Z",
  "photoURL":    null
}
```

`passwordHash` exists to satisfy the ER attribute and for out-of-band recovery.
Login is verified by Firebase Auth, not by this field. Google-only accounts store
`null`.

## 5. Registration flow

```
Full name + email + password
        │
        ▼  POST /api/send-otp   { email, userName }            ← no password, no code
   server: generateOtp() (6 digits, first one 1-9 so the UI can reject a leading 0)
        │        otp_hash = HMAC-SHA256(OTP_PEPPER, lower(email) + ':' + code)
        ▼        auth_otp_issue(email, otp_hash, ttl 600, cooldown 60)
   public.auth_otp  ← one row per address, normalized email, attempts 0
        │        then Nodemailer → Gmail → the student's inbox
        ▼        (mail failed after two tries ⇒ auth_otp_discard, so no orphan challenge)
   student types the code → POST /api/verify-otp { email, code }
        │        auth_otp_verify: recompute digest, compare, DELETE on match
        │        expired ⇒ row deleted + `expired` (resend unlocked); 3rd wrong guess ⇒
        │        row deleted + `locked`; the code is single-use, so a replay reads as
        │        "not right" rather than as a second success
        ▼  only on { verified: true }, exactly once:
   supabase.auth.signUp({ email, password, options:{ data:{ full_name } } })
        │        → auth.users row → handle_new_user() → public.students
        ▼          (role 'student' is set by the trigger; the client sends nothing else)
   session in the context → /dashboard
```

What that ordering buys, and why it is the shape of the system:

* **The browser never holds the code.** It asks for one, types one, and learns whether
  it was right. Nothing in `src/` can read, list, or extend a challenge, so there is no
  client-side bypass to find.
* **The stored digest is keyed.** `OTP_PEPPER` means a leaked `public.auth_otp` is not a
  list of crackable OTP hashes — the 10^6 code space cannot be attacked offline.
* **Every limit is enforced where the row lives**: TTL, the 60-second resend gap, the
  3-attempt ceiling and single use are CHECK constraints and one `FOR UPDATE` statement
  in `auth_otp_verify`, not application discipline. Two tabs, two devices, or a scripted
  client all meet the same numbers.
* An address that never proves control leaves **no** account behind — no abandoned
  `auth.users` row, no orphan `public.students` row, no rollback code needed.
* The password goes to the auth endpoint only: never to `/api/send-otp`, never to
  `/api/verify-otp`, never into Postgres, Firestore, or web storage.
* Supabase's own `verifyOtp` / `resend({ type: 'signup' })` are **not** part of this
  flow. `resendSignupCode` remains only for the Log in tab's "my address was never
  confirmed" case, which is a different state.

Rate limits sit in front of the store as well (`api/_otpStore.js`): 5 sends and 10
verifications per address per 10 minutes, 20 requests per IP — a per-process sliding
window, cheap and forgettable, because the durable limits are the database's.

Two known gaps, stated rather than papered over:

* The `verify-otp` → `signUp` handoff is not atomic: the browser performs `signUp`, so
  a captured `{ verified: true }` response could in principle be replayed by an attacker
  who also holds the password. Closing it needs a server-side `signUp` (or a one-shot
  signed ticket), which changes how the session is established — deliberately out of
  scope here.
* The per-IP window is per serverless instance; it throttles a naive script, not a
  distributed one. The address-scoped ceiling is the one that matters.

## 6. Routes

| Route | Requires |
| --- | --- |
| `/signup` | public — `?mode=login\|signup` picks the tab, `?method=email\|google` picks the step |
| `/login`, `/register` | redirect to `/signup` carrying `location.state` |
| `/dashboard`, `/exams/…`, `/review/…` | signed-in student |
| `/admin/syllabus` | `role: admin` or `superAdmin` |

`ProtectedRoute` sends a guest to `/signup?mode=login` and stores the intended
path in `location.state.from`; after a successful login the user is returned there
instead of always to `/dashboard`.

## 7. Roles (RBAC)

* Roles are read from `public.students.role`, fetched by `auth_uid = <Supabase user
  id>` under RLS; `hasRole('admin')` means admin **or above**. (In Phase 1 the client
  read `students/{uid}` from Firestore; the field is the same, the store is not.)
* `firestore.rules` refuses client-side writes to `role`, `uid`, `email`,
  `studentId`, `createdAt`, `provider` — a student cannot promote themselves.
* **Admin authentication is not implemented** (owner's instruction). To make
  yourself an admin, run `update public.students set role = 'admin' where email =
  'you@example.com';` in the Supabase SQL editor. The trigger hard-codes `'student'`
  for every signup and `guard_student_protected_columns` blocks client writes to
  `role`, so no path through the browser can mint an admin.
* Admin-only *data* writes (`domains`, `courses`, `subjects`, `syllabuses`) are
  already gated on the same `role` field.

## 8. Known follow-ups

* OTP issue and verification are now server-side (this file §5). The remaining piece is
  the last browser-held secret: `signUp` itself, so the verified→created handoff can be
  atomic (§5's first gap).
* `meta/counters` is unreferenced by signup; `public.students.student_id` comes from the
  sequence. Ids can skip numbers on rolled-back signups — don't treat `studentId` as a
  row count.
* `firestore.rules` and the Firestore `otp_tokens` collection are no longer on the auth
  path. The collection can be dropped once no deployed client is old enough to read it;
  the rules file is untouched, because loosening or deleting rules is a separate
  decision with its own blast radius.
* The signup email is sent from one Gmail account with an app password. Gmail's daily
  send quota is a real ceiling for a cohort-wide signup day; a transactional provider
  is the follow-up, not this change.

## 9. Supabase dashboard checklist

| Setting | Where | Value |
| --- | --- | --- |
| **Confirm email** | Auth → Providers → **Email** | **OFF** — required. Our Gmail code is the verification, done *before* `signUp`; with this ON, `signUp` returns a user but **no session**, so the student is created and then stuck (the app reports "Account created, but this Supabase project still confirms email addresses itself" rather than looping). With it OFF the account is signed in immediately and **no second verification mail is sent**. |
| Allow new users to sign up | Auth → Providers → Email | **ON** — turning it off returns `Signups not allowed for this project` and signup cannot work at all |
| Confirm signup template | Auth → Email templates | Irrelevant to signup now (nothing to confirm). Leave the default. |
| OTP expiry / rate limits | Auth → Rate limits | Not used for signup. The 10-minute window and 60-second resend gap are enforced by `src/utils/otpService.js` + `api/send-otp.js` (5 codes/address/10 min, 12/IP). |
| Site URL | Auth → URL Configuration | `https://<prod-domain>` |
| Redirect URLs | Auth → URL Configuration | `https://<prod-domain>/**`, `http://localhost:5173/**` |
| Google provider | Auth → Providers → Google | Enabled; client id/secret from Google Cloud |
| Google authorised redirect URI | Google Cloud → Credentials | `https://<ref>.supabase.co/auth/v1/callback` (the panel above shows the exact value) |
| Recovery template | Auth → Email templates | Leave `{{ .ConfirmationURL }}`; the app lands on `/signup` in recovery mode either way |

A `redirectTo` that is not on the allow-list is **silently** rewritten to Site URL —
if Google sign-in returns to the wrong host, that is the setting to fix.

**Deploy checklist added by this change** — every item below has already cost one
production incident, so read them as gates, not notes:

| Gate | Where | Why it fails loudly or silently |
| --- | --- | --- |
| `public.auth_otp` + its 4 functions exist | apply `supabase/migrations/20260905120000_auth_otp.sql` (SQL Editor, or `supabase db push`) | `/api/send-otp` answers 502 `store_unavailable`. The migration is idempotent and grants nothing to `anon`/`authenticated`: RLS is enabled with **zero** policies, so only the service role can touch it, and only through the functions. |
| `OTP_PEPPER` | Vercel → Environment Variables → *Production* | Missing ⇒ 500 naming the variable (by design, names only). Present but changed ⇒ every outstanding code is invalid, which is the intended behaviour during an incident. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel → Environment Variables → *Production* | These are the **server** copies. The browser never sees them; `VITE_`-prefixing the service-role key would ship it to every visitor, and `src/supabase.js` deliberately refuses to boot on a secret key. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Vercel → Environment Variables → *Production* | Missing ⇒ 500. Revoked/expired app password ⇒ 500 *after* the challenge is issued, and the endpoint discards the challenge so the student can retry. |
| **CSP allows Supabase** | `index.html` → `connect-src` must list `https://*.supabase.co` | **This is what silently killed Google sign-in.** With it absent, the browser refuses `POST /auth/v1/token?grant_type=pkce`, so the code Google handed back is never exchanged, and every Supabase call (login, signup, profile reads) dies in the same way. The symptom is a generic "did not complete" with no server-side trace: the request never reaches Supabase, so it is invisible in the Supabase and Vercel logs. Verify after deploy with DevTools → Console: a CSP violation line naming `connect-src` means the app cannot authenticate at all. |

The return leg in the app, for reference: `src/supabase.js` captures `?code=`/`#code=`
once at module load and scrubs it from the URL; `AuthContext` owns the exchange
(`detectSessionInUrl` is off, so exactly one owner exists), reports
`exchanging → signed_in / failed(reason)`, and `Signup.jsx` renders that status instead
of guessing from a URL it can no longer read. A second `signInWithOAuth` cannot start
over a code in flight, because a fresh flow would rewrite this tab's PKCE verifier —
that is the bug that used to surface as "Unable to exchange external code".

## 10. What still needs a Firebase identity (bridge pending)

`public.students` is keyed by the Supabase user id, but Firestore rules and Storage
rules authenticate with **Firebase** (`request.auth`). Until the two are bridged, any
feature below gets `permission-denied` for a Supabase-only user — deliberately not
worked around, because faking a Firebase session (or loosening the rules) would be
the worse bug:

| Feature | Where | Today |
| --- | --- | --- |
| Exam history | `Dashboard.jsx:25`, `ExamPortal.jsx:304`, `ReviewPage.jsx:23` (`users/{uid}/examHistory`) | reads warn and come back empty; a save fails with "Failed to save exam results" |
| Syllabus uploads | `SyllabusAdmin.jsx:102` (`uploaderUid`), `syllabusStorage.js` (Storage rules) | admin writes rejected |
| Feedback / analytics | `FeedbackPage`, `api/feedback.js`, `api/ai.js` | Firestore/Storage paths still assume a Firebase uid |
| `firestore.rules` | `isSignedIn()` / `isSelf()` | still Firestore-only auth; untouched by this phase |

`AuthContext` keeps `currentUser` as a Firebase-*shaped* compat view (`uid`, `email`,
`displayName`, `photoURL`, `providerData`, `emailVerified`, `authProvider:
'supabase'`) so those pages keep compiling. It is a shape, not a credential:
`getIdToken()` is intentionally absent, because there is no Firebase token to mint.
The bridge (either a Supabase→Firebase token exchange, or rewriting the rules to
trust Supabase's JWT) is the next phase's decision.
