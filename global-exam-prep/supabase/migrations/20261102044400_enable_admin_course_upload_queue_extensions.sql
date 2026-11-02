-- Match the migration which enabled the Supabase-supported extensions in the project.
create schema if not exists pgmq;
create extension if not exists pgmq with schema pgmq;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
