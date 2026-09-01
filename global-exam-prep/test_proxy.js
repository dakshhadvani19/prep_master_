async function test() {
    try {
        const res = await fetch('http://localhost:5173/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Say hi in JSON' }],
                model: 'openai',
                jsonMode: true
            })
        });
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Response:', text);
    } catch (err) {
        console.error('Error:', err);
    }
}

test();
