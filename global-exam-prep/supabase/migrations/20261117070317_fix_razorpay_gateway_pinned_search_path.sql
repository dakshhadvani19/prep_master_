-- All application relations and helpers are schema-qualified. Pin SECURITY DEFINER search path to built-ins.
ALTER FUNCTION public.pm_subscription_payment_action(text, jsonb)
    SET search_path = pg_catalog;
