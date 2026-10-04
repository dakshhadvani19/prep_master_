# PrepMaster Authentication

## Current authentication architecture

PrepMaster uses **Supabase Auth as the only authentication system**.

- Email/password authentication is handled by Supabase Auth.
- Google OAuth uses Supabase PKCE.
- Signup is gated by the project's serverless OTP flow:
  - /api/send-otp generates and stores an HMAC digest in public.auth_otp.
  - /api/verify-otp verifies the code.
  - Only after successful verification does the browser create the Supabase Auth account.
- public.students is created by the database trigger attached to auth.users.
- Admin authorization comes from public.admins and the authenticated user's UUID.
- Passwords are never stored in application tables.
- The browser never receives a service-role/secret key.

## Client files

| Area | File |
|---|---|
| Supabase client | src/supabase.js |
| Auth provider | src/context/AuthContext.jsx |
| Auth helpers | src/utils/supabaseAuth.js |
| OTP client | src/utils/otpService.js |
| Signup UI | src/pages/Signup.jsx |
| Server OTP issue | api/send-otp.js |
| Server OTP verification | api/verify-otp.js |

## Session handling

src/supabase.js creates one browser Supabase client with persistSession, autoRefreshToken, PKCE, detectSessionInUrl disabled, and a dedicated prepmaster-supabase-auth storage key.

OAuth/recovery callback parameters are captured synchronously and exchanged once by AuthContext. This prevents multiple consumers from racing over the same one-time code.

The currentUser object is a small compatibility view derived from the Supabase user. It exposes uid, email, displayName, and photoURL; it is not a second authentication provider.

## Authorization

Client-side role state is only for routing/UI decisions.

Authoritative access control is database-side:
- auth.uid() identifies the caller.
- public.admins determines admin/super-admin status.
- RLS remains enabled on exposed tables.
- No role is accepted from localStorage, URL parameters, user metadata, or client-submitted profile fields.

## OTP requirements

Production requires these server-only variables:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OTP_PEPPER
- GMAIL_USER
- GMAIL_APP_PASSWORD

The service-role key is used only by serverless code that must write the private OTP table. It must never be prefixed with VITE_.

## Current non-auth fallbacks

Some non-auth features do not yet have persistent Supabase tables. They therefore use explicit browser-local/static adapters:
- Exam history: src/utils/examHistoryStorage.js
- Syllabus metadata/text: src/utils/syllabusStorage.js
- Temporary numeric helper counters: src/utils/hashUtil.js

These are intentionally temporary. They do not provide cross-device persistence or server-side durability.

## Rules

Do not:
1. add another authentication provider;
2. put a secret/service-role key in frontend code;
3. create a client-writable role field;
4. use localStorage as the authority for authorization;
5. bypass RLS to make a feature appear functional;
6. reintroduce a removed backend just to restore persistence.

When persistent storage is implemented later, migrate these local adapters to properly designed Supabase tables/RLS.