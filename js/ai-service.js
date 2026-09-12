import { apiRequest } from './api.js';

const AI_TIMEOUT = 15000;
const GROQ_ROUTE = '/groq';

async function rateTaskWithAI(description, goals) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);

    try {
        const response = await apiRequest(GROQ_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ description, goals }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('AI request timed out');
        }
        throw error;
    }
}

export { rateTaskWithAI };
