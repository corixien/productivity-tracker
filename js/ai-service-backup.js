const AI_RATE_TIMEOUT = 10000;

async function rateTaskWithAI(taskDescription) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_RATE_TIMEOUT);

    try {
        const response = await fetch('/api/ai/rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: taskDescription }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'AI service error' }));
            throw new Error(error.error || 'AI service returned an error');
        }

        const data = await response.json();
        if (!data.name || !data.duration || !data.hardness) {
            throw new Error('Invalid AI response: missing required fields');
        }

        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

export { rateTaskWithAI };
