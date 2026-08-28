const AI_RATE_TIMEOUT = 10000;

async function rateTaskWithAI(taskDescription, goals) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_RATE_TIMEOUT);

    try {
        const url = '/api/ai/rate';
        console.log('[AI] Calling:', url);
        console.log('[AI] Origin:', window.location.origin);
        console.log('[AI] Online:', navigator.onLine);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: taskDescription, goals }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log('[AI] Response:', response.status, response.statusText);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'AI service error' }));
            console.error('[AI] Error response:', error);
            throw new Error(error.error || 'AI service returned an error');
        }

        const data = await response.json();
        console.log('[AI] Data:', data);
        
        if (!data.name || !data.duration || !data.hardness) {
            throw new Error('Invalid AI response: missing required fields');
        }

        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('[AI] Fetch error:', error);
        console.error('[AI] Error name:', error.name);
        console.error('[AI] Error message:', error.message);
        throw error;
    }
}

export { rateTaskWithAI };
