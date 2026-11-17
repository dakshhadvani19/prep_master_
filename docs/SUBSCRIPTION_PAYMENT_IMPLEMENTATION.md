# PrepMaster Subscription and Razorpay Test Mode

## Current status

- Public \`Subscriptions\` and \`Subscribers\` columns remain unchanged from the ER diagram.
- The private payment ledger and webhook-event tables are created, indexed, RLS-enabled and forced.
- The database payment gateway is callable only by \`service_role\`; it runs as SECURITY INVOKER with a pinned \`pg_catalog\` search path.
- Razorpay Test Mode credentials and \`RAZORPAY_WEBHOOK_SECRET\` are present in Vercel Production. Secret values are not stored in this repository or shown in documentation.
- Weekly and Monthly catalogue rows are seeded with the approved token allocations.
- Custom checkout uses the approved weekly-rate formula and ₹10–₹999 whole-rupee limits.

## Public ER tables (unchanged)

\`public."Subscriptions"\`
- \`SubscriptionId BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY\`
- \`Amount VARCHAR(20) NOT NULL\`
- \`Tokens BIGINT NOT NULL\`
- \`TimeValidity VARCHAR(30) NOT NULL\`

\`public."Subscribers"\`
- \`SubscriberId BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY\`
- \`StudentId BIGINT\` references \`public."Students"("StudentId")\`
- \`StartDate TIMESTAMP NOT NULL\`
- \`EndDate TIMESTAMP NOT NULL\`
- \`SubscriptionId BIGINT\` references \`public."Subscriptions"("SubscriptionId")\`
- \`RemainingTokens BIGINT NOT NULL\`

No public table columns or constraints were changed. Custom purchases use the nullable \`Subscribers.SubscriptionId\` as designed: custom subscriber rows do not reference a fixed catalogue row. Their precise purchase details stay in the private payment ledger.

## Approved plan rules

| Plan | Price | Tokens | Validity |
|---|---:|---:|---:|
| Weekly | ₹39 | 1,000 | 7 days |
| Monthly | ₹149 | 4,000 | 30 days |
| Custom | ₹10–₹999 | Proportional | Proportional |

The live \`public."Subscriptions"\` catalogue contains:
- SubscriptionId 1: ₹39, 1,000 tokens, 7 days.
- SubscriptionId 2: ₹149, 4,000 tokens, 30 days.

Fixed plans are matched by amount and duration and checked against their approved token counts before checkout and again during activation.

## Custom plan calculation

The amount must be a whole number of rupees between ₹10 and ₹999 inclusive. The selected pricing basis is the weekly rate (₹39, 7 days, 1,000 tokens):

\`tokens = floor(amount × 1000 / 39)\`

\`validityDays = round(amount × 7 / 39)\`

Validity rounds to the nearest whole day; positive half-day ties round up. Tokens round down to a whole token so the proportional grant never exceeds the calculated entitlement. The server performs both calculations and ignores browser-supplied token and validity values.

| Custom amount | Tokens | Validity |
|---:|---:|---:|
| ₹10 | 256 | 2 days |
| ₹39 | 1,000 | 7 days |
| ₹149 | 3,820 | 27 days |
| ₹999 | 25,615 | 179 days |

The fixed Monthly plan remains more generous than a ₹149 custom purchase by design. Custom purchases store the amount/token/validity snapshot in \`private.payment_transactions\` and do not add extra fixed-plan rows to \`public."Subscriptions"\`.

## Private payment tables and access

### \`private.payment_transactions\`
Stores the authenticated student, plan kind, fixed catalogue reference when applicable, amount in paise, token and validity snapshots, environment, idempotency key, receipt, Razorpay IDs, status and activation timestamps.

### \`private.razorpay_webhook_events\`
Stores webhook event IDs, event type, associated order/payment IDs, signature-validation marker, processing state, retry count and errors. Event IDs deduplicate repeated deliveries. Raw webhook bodies and secrets are not stored.

Access:
- Both private tables have RLS enabled and forced.
- \`anon\` and \`authenticated\` have no private-schema usage or table grants.
- \`service_role\` has SELECT/INSERT/UPDATE only; DELETE is not granted.
- The payment RPC has EXECUTE only for \`service_role\`, runs as SECURITY INVOKER and validates the JWT role.
- Service-role and Razorpay secrets are never sent to the browser.

## Test Mode API flow

- \`GET /api/subscription-plans\` returns fixed plans, custom rules and checkout readiness.
- \`POST /api/razorpay-create-order\` authenticates a non-spam student, resolves all purchase values server-side and records a private pending transaction before creating the Razorpay order.
- \`POST /api/razorpay-verify-payment\` checks the Checkout HMAC, fetches payment details directly from Razorpay and activates only a matching captured payment.
- \`GET /api/subscription-status\` returns a transaction state only to its owning student.
- \`POST /api/razorpay-webhook\` validates the exact raw request body, deduplicates event IDs and handles authorised/captured/failed/paid events.

Renewal activation locks the student row and starts after the latest existing \`Subscribers.EndDate\`; otherwise it starts at the current time. Subscriber creation and payment activation occur atomically. Repeated verification or webhook delivery cannot create a second subscriber for an already-activated transaction.

Public payment URLs are mapped by Vercel rewrites onto existing API functions to stay within the Hobby serverless-function limit.

## Vercel environment

These sensitive variables are present in Production:
- \`RAZORPAY_KEY_ID\`
- \`RAZORPAY_KEY_SECRET\`
- \`RAZORPAY_WEBHOOK_SECRET\`
- \`RAZORPAY_MODE=test\`

Their values are intentionally not stored here. The server requires Test Mode and an \`rzp_test_\` Key ID; it rejects Live Mode. Razorpay variables currently target Production. Add them to Preview/Development only when checkout will be tested in those environments.

## Razorpay dashboard configuration still to verify

The presence of \`RAZORPAY_WEBHOOK_SECRET\` in Vercel does not prove that the corresponding webhook was registered in Razorpay. Confirm that a webhook exists in **Test Mode** at:

\`https://prepmaster-tau.vercel.app/api/razorpay-webhook\`

Subscribe to:
- \`payment.authorized\`
- \`payment.captured\`
- \`payment.failed\`
- \`order.paid\`

The secret saved in Razorpay must match the Vercel \`RAZORPAY_WEBHOOK_SECRET\`. Redeploy after changing the Vercel variable.

## Migration history

- \`20261117065000_create_private_razorpay_payment_ledger.sql\`
- \`20261117065152_razorpay_checkout_activation_gateway.sql\`
- \`20261117065233_fix_razorpay_webhook_event_deduplication.sql\`
- \`20261117070254_fix_razorpay_gateway_auth_jwt_search_path.sql\`
- \`20261117070317_fix_razorpay_gateway_pinned_search_path.sql\`
- \`20261117082403_activate_approved_subscription_plans_and_custom_weekly_rate.sql\`
- \`20261117082449_run_subscription_payment_gateway_as_service_role_invoker.sql\`

## Verification status

- Both fixed plan rows were confirmed in the live catalogue with the approved allocations.
- Custom boundary examples were checked against PostgreSQL numeric arithmetic.
- The payment RPC has EXECUTE denied to \`anon\` and \`authenticated\`, granted to \`service_role\`, and runs as SECURITY INVOKER with \`search_path = pg_catalog\`.
- A live Razorpay checkout has not yet been completed. End-to-end testing still requires confirmation of the Test Mode webhook in Razorpay and a simulated payment.


## Browser Content Security Policy and Firebase audit

### Razorpay Checkout CSP

The application uses the Content Security Policy in `global-exam-prep/index.html`. The policy explicitly permits:
- `checkout.razorpay.com` and `cdn.razorpay.com` in `script-src`.
- `api.razorpay.com`, `checkout.razorpay.com` and `cdn.razorpay.com` in `connect-src`.
- Razorpay Checkout/API frames in `frame-src`.
- Razorpay-hosted images in `img-src`.

The policy remains an allowlist; do not replace it with broad `https:` or `*` sources. The regression test is `global-exam-prep/tests/test-room-csp.test.js`.

### Firebase dependency audit (2026-11-17)

- No Firebase SDK imports or Firebase-specific service integrations were found in the tracked repository.
- `firebase` and `firebase-admin` are absent from the installed npm dependency tree and package manifests/lockfile.
- Student authentication, including Google sign-in, is implemented through Supabase Auth (`signInWithOAuth({ provider: 'google' })`). This is not Firebase and is intentionally retained.
- Supabase is the active authentication/database/storage backend in the application; no Firebase-backed application feature was identified that needs migration.

The Vercel project still contains these unused legacy environment variables, which are not referenced by the application source:
- `FIREBASE_MEASUREMENT_ID` (Preview, Production)
- `FIREBASE_APP_ID` (Preview, Production)
- `FIREBASE_MESSAGING_SENDER_ID` (Preview, Production)
- `FIREBASE_STORAGE_BUCKET` (Preview, Production)
- `FIREBASE_PROJECT_ID` (Preview, Production)
- `FIREBASE_AUTH_DOMAIN` (Production)
- `FIREBASE_API_KEY` (Production)

Remove those seven variables in Vercel Project Settings → Environment Variables, then redeploy to finish removing the unused Firebase configuration. No Firebase-to-Supabase code migration is pending based on the current source audit.
