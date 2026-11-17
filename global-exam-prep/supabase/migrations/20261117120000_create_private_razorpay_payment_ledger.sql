-- Private Razorpay payment ledger.
-- Public Subscriptions and Subscribers remain unchanged.

CREATE TABLE IF NOT EXISTS private.payment_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id BIGINT NOT NULL
        REFERENCES public."Students" ("StudentId") ON DELETE RESTRICT,
    subscription_id BIGINT NULL
        REFERENCES public."Subscriptions" ("SubscriptionId") ON DELETE RESTRICT,
    plan_kind TEXT NOT NULL
        CHECK (plan_kind IN ('weekly', 'monthly', 'custom')),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    tokens_granted BIGINT NOT NULL CHECK (tokens_granted > 0),
    validity_seconds BIGINT NOT NULL CHECK (validity_seconds > 0),
    validity_label VARCHAR(30) NOT NULL
        CHECK (char_length(btrim(validity_label)) BETWEEN 1 AND 30),
    environment TEXT NOT NULL DEFAULT 'test'
        CHECK (environment IN ('test', 'live')),
    idempotency_key UUID NOT NULL UNIQUE,
    receipt VARCHAR(40) NOT NULL UNIQUE,
    razorpay_order_id TEXT NULL UNIQUE,
    razorpay_payment_id TEXT NULL UNIQUE,
    payment_status TEXT NOT NULL DEFAULT 'order_pending'
        CHECK (payment_status IN (
            'order_pending', 'authorized', 'captured', 'failed',
            'cancelled', 'expired', 'activation_pending', 'activated', 'refunded'
        )),
    subscriber_id BIGINT NULL
        REFERENCES public."Subscribers" ("SubscriberId") ON DELETE RESTRICT,
    signature_verified_at TIMESTAMPTZ NULL,
    captured_at TIMESTAMPTZ NULL,
    activated_at TIMESTAMPTZ NULL,
    failure_code TEXT NULL,
    failure_description TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_transactions_activation_consistency
        CHECK (
            (payment_status <> 'activated' OR subscriber_id IS NOT NULL)
            AND (activated_at IS NULL OR subscriber_id IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS payment_transactions_student_created_idx
    ON private.payment_transactions (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_transactions_status_created_idx
    ON private.payment_transactions (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_transactions_plan_created_idx
    ON private.payment_transactions (subscription_id, created_at DESC)
    WHERE subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS private.razorpay_webhook_events (
    event_id TEXT PRIMARY KEY
        CHECK (char_length(btrim(event_id)) BETWEEN 1 AND 255),
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'payment.authorized', 'payment.captured',
            'payment.failed', 'order.paid'
        )),
    razorpay_order_id TEXT NULL,
    razorpay_payment_id TEXT NULL,
    transaction_id UUID NULL
        REFERENCES private.payment_transactions (transaction_id) ON DELETE RESTRICT,
    signature_verified BOOLEAN NOT NULL DEFAULT TRUE
        CHECK (signature_verified = TRUE),
    processing_status TEXT NOT NULL DEFAULT 'received'
        CHECK (processing_status IN ('received', 'processing', 'processed', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NULL,
    last_error TEXT NULL
);

CREATE INDEX IF NOT EXISTS razorpay_webhook_events_order_idx
    ON private.razorpay_webhook_events (razorpay_order_id)
    WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS razorpay_webhook_events_payment_idx
    ON private.razorpay_webhook_events (razorpay_payment_id)
    WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS razorpay_webhook_events_status_received_idx
    ON private.razorpay_webhook_events (processing_status, received_at);

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

ALTER TABLE private.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.payment_transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE private.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.razorpay_webhook_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.payment_transactions
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.razorpay_webhook_events
    FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE private.payment_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.razorpay_webhook_events TO service_role;
