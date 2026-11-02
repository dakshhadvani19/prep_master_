-- Requires the two worker secrets to exist in Supabase Vault:
-- admin_course_upload_worker_url and admin_course_upload_worker_secret.
select cron.schedule(
    'admin-course-upload-worker-every-minute',
    '* * * * *',
    $worker$
    select net.http_post(
        url := (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'admin_course_upload_worker_url'
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-course-upload-worker-token', (
                select decrypted_secret
                from vault.decrypted_secrets
                where name = 'admin_course_upload_worker_secret'
            )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
    );
    $worker$
);
