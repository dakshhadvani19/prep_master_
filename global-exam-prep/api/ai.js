/* global process */
export const config = { runtime: 'edge' };

/**
 * Categorises a Groq provider error so the frontend can display an
 * actionable message instead of a generic one.
 *
 * Categories:
 *   - rate_limit: temporary TPM/RPM limit; retry after the indicated seconds
 *   - schema_config: unsupported response format or schema; not retryable
 *   - generation_format: the model failed to produce valid structured output
 *   - upstream: any other provider error
 */
export function categoriseGroqError(status, message, providerCode = '') {
    const msg = String(message ?? '').toLowerCase();
    const code = String(providerCode ?? '').toLowerCase();

    if (status === 429 || /rate limit reached|too many requests|tpm|tokens per minute/i.test(msg)) {
        return 'rate_limit';
    }

    // Groq returns code=json_validate_failed for the exact
    // "Failed to validate JSON ... See 'failed_generation'" error.
    // Handle it before generic upstream classification so the client can
    // switch response format and recover instead of retrying the same request.
    if (code === 'json_validate_failed'
        || /failed to validate json|generated json does not match|json_validate_failed/i.test(msg)) {
        return 'generation_format';
    }

    if (status === 400 && /json_schema|schema|response_format|structured output|unsupported/i.test(msg)) {
        return 'schema_config';
    }
    if (status === 400 && /failed to generate|generation|invalid.*json|malformed/i.test(msg)) {
        return 'generation_format';
    }
    return 'upstream';
}

function parseRetryAfterSeconds(message, headers) {
    // Groq sends retry-after in seconds; also check the reset header.
    const headerValue = headers?.get('retry-after');
    if (headerValue) return Number(headerValue);
    const match = String(message ?? '').match(/try again in\s+([\d.]+)\s*s/i);
    return match ? Number(match[1]) : 0;
}

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

        const env = typeof process !== 'undefined' && process.env ? process.env : {};
    const apiKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY;
    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: { message: 'API key not configured on the server.', category: 'upstream' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await req.json();

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: body.model ?? 'openai/gpt-oss-20b',
                messages: body.messages,
                response_format: body.response_format,
                temperature: body.temperature ?? 0.1,
                reasoning_effort: body.reasoning_effort ?? 'low',
            }),
        });

        // Forward provider rate-limit headers so the client can wait accurately.
        const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
        for (const header of ['retry-after', 'x-ratelimit-reset-tokens']) {
            const value = res.headers.get(header);
            if (value) responseHeaders.set(header, value);
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const message = err.error?.message || `Groq API Error: ${res.status}`;
            const providerCode = err.error?.code || '';
            const category = categoriseGroqError(res.status, message, providerCode);
            const retryAfter = parseRetryAfterSeconds(message, res.headers);

            // Preserve diagnostic metadata without returning generated payloads or
            // credentials. Groq's failed_generation field can be empty or large.
            console.error('[Groq API error]', {
                status: res.status,
                category,
                providerCode,
                message,
                hasFailedGeneration: Boolean(err.error?.failed_generation),
            });

            return new Response(
                JSON.stringify({
                    error: {
                        message,
                        category,
                        providerCode: providerCode || undefined,
                        hasFailedGeneration: Boolean(err.error?.failed_generation),
                        status: res.status,
                        retryAfter: retryAfter > 0 ? retryAfter : undefined,
                    },
                }),
                { status: res.status, headers: responseHeaders }
            );
        }

        const data = await res.json();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        return new Response(
            JSON.stringify({ error: { message: err.message, category: 'upstream' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
