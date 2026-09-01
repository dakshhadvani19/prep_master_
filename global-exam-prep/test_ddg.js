async function testDDG() {
    try {
        // 1. Get VQD token
        const initRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
            headers: { 
                'x-vqd-accept': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const vqd = initRes.headers.get('x-vqd-token');
        console.log('VQD:', vqd);
        
        if (!vqd) {
            console.error('Failed to get VQD');
            return;
        }

        // 2. Chat
        const chatRes = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-vqd-token': vqd
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Say hello in JSON format {"msg": "..."}' }]
            })
        });
        
        console.log('Status:', chatRes.status);
        const text = await chatRes.text();
        console.log('Response:', text);
    } catch (err) {
        console.error('Error:', err);
    }
}

testDDG();
