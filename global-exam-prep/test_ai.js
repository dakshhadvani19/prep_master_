// Node 24 has built-in fetch

async function test() {
    try {
        const res = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Say hello in JSON' }],
                model: 'openai',
                jsonMode: true
            })
        });
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Raw Response:', text);
        try {
            const parsed = JSON.parse(text);
            console.log('Parsed JSON:', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('JSON Parse Failed');
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

test();