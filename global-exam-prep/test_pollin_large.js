async function test() {
    const url = 'https://text.pollinations.ai/';
    console.time('pollinations');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'system', content: 'Generate exactly 30 exam questions.' }],
                jsonMode: true,
                model: 'openai'
            })
        });
        console.log(res.status);
        console.log(await res.text().then(t => t.substring(0, 100)));
    } catch (e) { console.error("ERR", e.message); }
    console.timeEnd('pollinations');
}
test();
