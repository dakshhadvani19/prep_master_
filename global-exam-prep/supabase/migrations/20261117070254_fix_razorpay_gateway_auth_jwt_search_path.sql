-- Retain an explicit path for the auth helper before final hardening.
ALTER FUNCTION public.pm_subscription_payment_action(text, jsonb)
    SET search_path = pg_catalog, public, private, auth;
