# Auth setup (students)

Firebase Authentication + Firestore, with email/OTP registration, Google sign-in,
password reset and role-based route guards.

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
Add `GMAIL_USER` / `GMAIL_APP_PASSWORD` to the Vercel project (Production +
Preview) — they are read only by `api/send-otp.js`.

## 3. Deploy the rules

```bash
cd global-exam-prep
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

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
email + name + password  →  /api/send-otp (nodemailer)
                         →  6-digit code, hashed in otp_tokens, 10 min TTL
                         →  3 wrong attempts invalidates the code
                         →  createUserWithEmailAndPassword
                         →  students/{uid} written
```

If the Firestore write fails, the just-created Auth user is deleted so the email
address is not burned. An OTP is single-use and is destroyed before the account is
created.

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

* Roles are read from `students/{uid}.role`; `hasRole('admin')` means admin **or
  above**.
* `firestore.rules` refuses client-side writes to `role`, `uid`, `email`,
  `studentId`, `createdAt`, `provider` — a student cannot promote themselves.
* **Admin authentication is not implemented** (owner's instruction). To make
  yourself an admin, open Firestore in the console and set `role: "admin"` on
  your own `students/{uid}` document. The console bypasses rules; the client
  cannot.
* Admin-only *data* writes (`domains`, `courses`, `subjects`, `syllabuses`) are
  already gated on the same `role` field.

## 8. Known follow-ups

* Move OTP issue + verification server-side (Admin SDK) so the code never
  transits the browser. The client currently writes only the SHA-256 digest under
  an unguessable `base64url(email)~nonce` key, and `otp_tokens` cannot be listed.
* `meta/counters` gives dense integer `studentId`s; a transaction is consumed even
  when a signup later fails, so ids can skip numbers. Harmless, but don't treat
  `studentId` as a row count.
