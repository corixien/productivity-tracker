const AI_RATE_TIMEOUT = 10000;

async function rateTaskWithAI(taskDescription) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_RATE_TIMEOUT);

    try {
        const url = '/api/ai/rate';
        console.log('AI: Calling', url, 'with description:', taskDescription);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: taskDescription }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log('AI: Response status:', response.status);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'AI service error' }));
            console.error('AI: Error response:', error);
            throw new Error(error.error || 'AI service returned an error');
        }

        const data = await response.json();
        console.log('AI: Success data:', data);
        
        if (!data.name || !data.duration || !data.hardness) {
            throw new Error('Invalid AI response: missing required fields');
        }

        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('AI: Fetch error:', error);
        throw error;
    }
}

export { rateTaskWithAI };
