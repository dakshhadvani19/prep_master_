-- Keep the SECURITY DEFINER payment RPC search path pinned to trusted built-ins only.
-- All non-built-in functions and tables are explicitly schema-qualified.
ALTER FUNCTION public.pm_subscription_payment_action(text, jsonb)
    SET search_path = pg_catalog;
