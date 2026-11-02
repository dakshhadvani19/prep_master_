-- Keep the scheduler's outbound HTTP timeout above the Vercel worker
-- maxDuration (60 seconds) so the HTTP client does not terminate a valid
-- PDF/DOCX/CSV processing request prematurely.
select cron.unschedule('admin-course-upload-worker-every-minute');

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
        timeout_milliseconds := 65000
    );
    $worker$
);
