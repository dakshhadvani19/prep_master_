async function testLarge() {
    const largePrompt = "A".repeat(8000); 
    try {
        const res = await fetch('http://localhost:5173/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: 'Summary this' },
                    { role: 'user', content: largePrompt }
                ],
                model: 'mistral'
            })
        });
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Response length:', text.length);
    } catch (err) {
        console.error('Error:', err);
    }
}

testLarge();
