export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: { message: 'API key (GROQ_API_KEY) not configured on Vercel deployment.' } }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const body = await req.json();
        
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: body.model || 'llama-3.1-8b-instant',
                messages: body.messages,
                response_format: body.response_format,
                // 0.1 made the 8B model repeat stems; uniqueness is enforced in app code.
                temperature: typeof body.temperature === 'number' ? body.temperature : 0.7
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return new Response(JSON.stringify({ error: { message: err.error?.message || `Groq API Error: ${res.status}` } }), {
                status: res.status, headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await res.json();
        return new Response(JSON.stringify(data), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: { message: err.message } }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
