const AI_TIMEOUT = 15000;

async function rateTaskWithAI(description, goals) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);

    try {
        const response = await fetch('/api/ai/rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, goals }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'AI service error' }));
            throw new Error(error.error || 'AI service returned an error');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('AI request timed out');
        }
        throw error;
    }
}

export { rateTaskWithAI };
