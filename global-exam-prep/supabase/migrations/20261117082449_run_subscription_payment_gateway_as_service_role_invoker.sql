-- The API calls this RPC with the service_role JWT; service_role already has all required table grants.
-- SECURITY INVOKER avoids inheriting the migration owner's privileges.
ALTER FUNCTION public.pm_subscription_payment_action(text, jsonb) SECURITY INVOKER;
