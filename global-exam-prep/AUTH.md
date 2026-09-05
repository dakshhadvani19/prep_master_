# Auth setup (students)

**Student identity is Supabase Auth** (email + password, Google OAuth, password
recovery); the profile row is `public.students`, created by a database trigger.
**Signup's 6-digit code is still mailed by this app** through `/api/send-otp`
(Nodemailer + Gmail) and checked against the Firestore `otp_tokens` digest — the
account is only created after that check passes, so Supabase never mails a signup
code. **Everything else is still Firebase**: Firestore data (exams,
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
        ▼  POST /api/send-otp   { email, otp, userName }      ← no password, ever
   Nodemailer → Gmail → the student's inbox (6 digits, 10 min)
        │        (Firestore otp_tokens/<base64url(email)>~<nonce> keeps ONLY
        │         the SHA-256 digest; attempts ≤ 3; resend throttled to 60 s)
        ▼
   student types the code → verifyOTP() compares digests, then deletes the
        │                   challenge (single use). Wrong/expired/locked out ⇒
        │                   stop on the OTP screen, nothing created.
        ▼  only after verification, exactly once:
   supabase.auth.signUp({ email, password, options:{ data:{ full_name } } })
        │        → auth.users row → handle_new_user() → public.students
        ▼          (role 'student' is set by the trigger; the client sends nothing else)
   session in the context → /dashboard
```

Consequences of that order, which are the point of it:

* An address that never proves control leaves **no** account behind — no abandoned
  `auth.users` row, no orphan `public.students` row, no rollback code needed.
* The password goes to the auth endpoint only: never to `/api/send-otp`, never into
  Firestore, never into `sessionStorage`/`localStorage`, and the pending copy in the
  context is dropped as soon as the account exists (or the student goes back).
* The code is single-use, so a replayed or double-submitted form cannot create a
  second account; the in-flight `signUp` promise is also shared for that reason.
* Supabase's own `verifyOtp` / `resend({ type: 'signup' })` are **not** part of this
  flow. `resendSignupCode` remains only for the Log in tab's "my address was never
  confirmed" case, which is a different state.

If `/api/send-otp` fails (500 / no creds / offline), `createAndSendOTP` deletes the
challenge it just wrote, so the student can retry immediately instead of waiting out
a cooldown against a code nobody received.

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

* Move OTP issue + verification server-side (Admin SDK / an Edge Function) so the
  code never transits the browser. Today the browser generates the code, mails it
  through `api/send-otp`, and stores only its SHA-256 digest — the raw code is in
  the request body for one hop. `hashUtil.js` still backs the digest and
  `meta/counters` is unreferenced by signup (ids come from the Postgres sequence).
* `meta/counters` gave dense integer `studentId`s; `public.students.student_id` now
  comes from the sequence. Ids can still skip numbers on rolled-back signups — don't
  treat `studentId` as a row count.
* The 10-minute resend/expiry hint in the UI is display-only. Supabase's project
  setting is authoritative; keep them aligned or the hint over-promises.

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

## 8. Known follow-ups

* Move OTP issue + verification server-side (Admin SDK) so the code never
  transits the browser. The client currently writes only the SHA-256 digest under
  an unguessable `base64url(email)~nonce` key, and `otp_tokens` cannot be listed.
* `meta/counters` gives dense integer `studentId`s; a transaction is consumed even
  when a signup later fails, so ids can skip numbers. Harmless, but don't treat
  `studentId` as a row count.
