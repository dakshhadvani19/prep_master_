async function test() {
    const url = 'https://corsproxy.io/?https://api.groq.com/openai/v1/models';
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${process.env.VITE_GROQ_API_KEY}` } });
        console.log(res.status);
        console.log(await res.text().then(t => t.substring(0, 100)));
    } catch (e) { console.error("ERR", e.message); }
}
test();
