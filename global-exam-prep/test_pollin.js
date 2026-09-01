async function test() {
    const url = 'https://text.pollinations.ai/';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'system', content: 'You are an AI.' }, { role: 'user', content: 'Generate exactly one JSON array containing {"text":"hello"}' }],
                jsonMode: true,
                model: 'openai'
            })
        });
        console.log(res.status);
        console.log(await res.text());
    } catch (e) { console.error("ERR", e.message); }
}
test();
