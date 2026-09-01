async function test() {
    const url = 'http://localhost:5173/api/ai';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: 'You are an expert university examiner API. Output strictly valid raw JSON without code blocks or markdown.' },
                    { role: 'user', content: 'Generate exactly 2 multiple choice questions (MCQs). CRITICAL: Respond with ONLY a raw JSON array.' }
                ],
                model: 'openai',
                jsonMode: true
            })
        });
        console.log(res.status);
        const text = await res.text();
        console.log(text.substring(0, 500));
        try {
            const json = JSON.parse(text);
            if (!Array.isArray(json)) console.error("NOT AN ARRAY:", typeof json, Object.keys(json));
            else console.log("IS ARRAY. LEN:", json.length);
        } catch (e) { console.error("PARSE ERR:", e.message) }
    } catch (e) { console.error("NET ERR", e.message); }
}
test();
