# PrepMaster Subscription and Razorpay Test Mode

## Current status

- The existing public `Subscriptions` and `Subscribers` tables are preserved exactly as defined by the ER diagram.
- The private `payment_transactions` and `razorpay_webhook_events` tables have been created and verified in Supabase.
- The matching SQL is versioned in `global-exam-prep/supabase/migrations/20261117120000_create_private_razorpay_payment_ledger.sql`.
- Razorpay Test Mode environment variables are not configured yet. No Checkout request can be enabled until test credentials are added.
- No weekly/monthly plan rows have been seeded because token allocations are still undecided.
- The custom amount-to-validity/token formula is still undecided.

## Public ER tables (unchanged)

`public."Subscriptions"`
- `SubscriptionId BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `Amount VARCHAR(20) NOT NULL`
- `Tokens BIGINT NOT NULL`
- `TimeValidity VARCHAR(30) NOT NULL`

`public."Subscribers"`
- `SubscriberId BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `StudentId BIGINT` references `public."Students"("StudentId")`
- `StartDate TIMESTAMP NOT NULL`
- `EndDate TIMESTAMP NOT NULL`
- `SubscriptionId BIGINT` references `public."Subscriptions"("SubscriptionId")`
- `RemainingTokens BIGINT NOT NULL`

No columns were added to or removed from either public table.

## Private payment tables

### `private.payment_transactions`

Stores one backend-created Razorpay order / purchase intent with:
- authenticated student and selected subscription reference
- server-calculated amount in paise, token grant and validity snapshots
- Test/Live environment marker
- unique idempotency key and Razorpay receipt/order/payment identifiers
- payment lifecycle status, verification/capture/activation timestamps
- failure details and resulting subscriber record reference

The snapshots ensure later plan edits do not silently change the amount or entitlement of an existing checkout.

### `private.razorpay_webhook_events`

Stores webhook event IDs, event type, associated order/payment/transaction IDs, signature-verification marker, processing state, attempt count and processing errors. Event ID is the primary key to deduplicate repeated deliveries. The raw webhook body and secrets are not stored.

### Access control

- Both private tables have RLS enabled and forced.
- `anon` and `authenticated` have no schema usage or table privileges.
- `service_role` has SELECT, INSERT and UPDATE only; DELETE is not granted.
- The server must keep the service-role key and all Razorpay secrets out of browser code.

## Agreed plan prices and durations

| Plan | Price | Validity |
|---|---:|---|
| Weekly | ₹39 | 7 × 24 hours |
| Monthly | ₹149 | 30 × 24 hours |
| Custom | Student-entered | To be calculated using an approved formula |

Renewals are queued after the latest existing subscriber `EndDate`, otherwise they start at the current time.

## Remaining business rules before purchases are enabled

1. Token allowance for the weekly plan.
2. Token allowance for the monthly plan.
3. Custom amount minimum and maximum.
4. Exact custom amount → validity formula, including rounding.
5. Custom amount → token allocation formula.
6. Whether users may edit a calculated custom plan and, if so, what recalculation rule applies.

No production checkout route should accept a purchase until those rules are fixed.

## Planned Test Mode integration

1. Backend authenticates the Supabase session and resolves the plan from server-owned data.
2. Backend creates a Razorpay Order and a private pending transaction.
3. Browser opens Standard Checkout using only the public Test Key ID and order details.
4. Backend verifies the Checkout signature using the server-held Test Key Secret, fetches the payment, and requires the matching order, amount, INR currency and captured status.
5. Webhook endpoint verifies the HMAC signature against the exact raw request bytes using the separate webhook secret.
6. Webhook event IDs and payment/order identifiers are processed idempotently.
7. One database transaction records the verified payment, creates or references the subscription plan, queues/creates the subscriber row and marks the transaction activated.
8. Student UI polls a no-store payment-status endpoint and displays pending, success, queued, failure or expired status.

Webhook events to subscribe to in Razorpay Test Mode:
- `payment.authorized`
- `payment.captured`
- `payment.failed`
- `order.paid`

Only a captured payment should activate a subscription. An authorised-but-not-captured payment is not sufficient.

## Vercel Test Mode environment variables

Add these as encrypted/sensitive server-only environment variables (Production and Preview only when intentionally testing there):
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_MODE=test`

Do not add the secret values to GitHub or any `VITE_*` variable.
