async function test() {
    const url = 'https://api.groq.com/openai/v1/models';
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Connection': 'keep-alive'
            }
        });
        console.log(res.status);
        console.log(await res.text().then(t => t.substring(0, 100)));
    } catch (e) { console.error("ERR", e.message); }
}
test();
