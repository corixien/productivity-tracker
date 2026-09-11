const { getGroqConfig } = require('../config');
const { query } = require('../utils/database');
const { logGroqRequest, logGroqResponse, logError } = require('../services/loggingService');
const logger = require('../utils/logger');

const DEFAULT_GROQ_MODEL = 'groq/compound';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;

function extractJsonFromResponse(content) {
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
    } else {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }
    }
    return JSON.parse(jsonStr);
}

function calculateXp(productivity, difficulty, duration, bonus = 0) {
    if (productivity === 0) return 0;
    return Math.round((productivity * difficulty) + (duration / 5) + bonus);
}

async function rateTask(description, goals, userId, username) {
    const config = getGroqConfig();
    const apiKey = config.apiKey;
    const model = config.model || DEFAULT_GROQ_MODEL;
    const baseUrl = config.baseUrl;

    if (!apiKey) {
        throw new Error('GROQ_API_KEY is not configured');
    }

    const goalsText = goals ? `\n\nUser's long-term goals:\n${goals}` : '';
    const userMessage = `${description.trim()}${goalsText}`;

    const requestPayload = {
        model,
        messages: [
            { role: 'system', content: `Return ONLY this JSON (no other text, no markdown):

{"name":"short name","duration":minutes,"productivity":0-5,"difficulty":1-5,"category":"learning,exercise,creative,admin,social,deep-work,or other"}

Rules:
- productivity 0-5: how much it helps goals (0=waste, 5=great)
- difficulty 1-5: effort level
- duration: minutes
- category: pick the best one

Examples:
"I played the piano" -> {"name":"Played piano","duration":30,"productivity":4,"difficulty":3,"category":"creative"}
"watched YouTube 1 hour" -> {"name":"Watched YouTube","duration":60,"productivity":0,"difficulty":1,"category":"other"}
"coding 1 hour" -> {"name":"Coding","duration":60,"productivity":5,"difficulty":4,"category":"deep-work"}
"basketball with friends" -> {"name":"Basketball","duration":60,"productivity":4,"difficulty":3,"category":"exercise"}
"homework 1 hour" -> {"name":"Homework","duration":60,"productivity":4,"difficulty":2,"category":"learning"}
"jogging 30 min" -> {"name":"Jogging","duration":30,"productivity":4,"difficulty":3,"category":"exercise"}
"cleaned my room" -> {"name":"Cleaned room","duration":20,"productivity":2,"difficulty":2,"category":"admin"}

Return ONLY the JSON.` },
            { role: 'user', content: userMessage }
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' }
    };

    let groqResponse = null;
    let lastError = null;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

            groqResponse = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestPayload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (groqResponse.status === 429 && attempt < MAX_RETRIES) {
                const waitTime = Math.pow(2, attempt) * 2000;
                logger.warn(`GROQ rate limited, retrying in ${waitTime}ms`, { attempt: attempt + 1 });
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            break;
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
                const waitTime = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            throw error;
        }
    }

    const responseTimeMs = Date.now() - startTime;

    if (!groqResponse || !groqResponse.ok) {
        const errorText = groqResponse ? await groqResponse.text().catch(() => '') : lastError?.message || 'Unknown error';
        let errorMessage = `GROQ API error (HTTP ${groqResponse?.status || 'N/A'})`;

        if (groqResponse?.status === 401) {
            errorMessage = 'GROQ authentication failed - invalid API key';
        } else if (groqResponse?.status === 404) {
            errorMessage = 'GROQ model not found';
        } else if (groqResponse?.status === 429) {
            errorMessage = 'GROQ rate limit exceeded';
        }

        await logGroqRequest(userId, username, requestPayload, model).catch(() => null);
        await logGroqResponse(null, { error: errorText }, responseTimeMs, false, errorMessage).catch(() => null);
        throw new Error(errorMessage);
    }

    let groqData;
    try {
        groqData = await groqResponse.json();
    } catch (error) {
        const errorMessage = 'Invalid JSON response from GROQ';
        await logGroqRequest(userId, username, requestPayload, model).catch(() => null);
        await logGroqResponse(null, { error: error.message }, responseTimeMs, false, errorMessage).catch(() => null);
        throw new Error(errorMessage);
    }

    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
        const errorMessage = 'Empty response from GROQ';
        await logGroqRequest(userId, username, requestPayload, model).catch(() => null);
        await logGroqResponse(null, groqData, responseTimeMs, false, errorMessage).catch(() => null);
        throw new Error(errorMessage);
    }

    let taskData;
    try {
        taskData = extractJsonFromResponse(content);
    } catch (parseError) {
        const errorMessage = 'Failed to parse GROQ response';
        await logGroqRequest(userId, username, requestPayload, model).catch(() => null);
        await logGroqResponse(null, { raw: content }, responseTimeMs, false, errorMessage).catch(() => null);
        throw new Error(errorMessage);
    }

    const productivity = taskData.productivity !== undefined ? Math.max(0, Math.min(5, parseInt(taskData.productivity))) : 3;
    const difficulty = taskData.difficulty !== undefined ? Math.max(1, Math.min(5, parseInt(taskData.difficulty))) : 3;
    const duration = Math.max(1, Math.min(1440, parseInt(taskData.duration) || 30));
    const bonus = 0;

    const xp = calculateXp(productivity, difficulty, duration, bonus);

    const responseData = {
        name: String(taskData.name || description).slice(0, 100),
        duration,
        productivity,
        difficulty,
        bonus,
        category: taskData.category || 'other',
        xp,
        reasoning: taskData.reasoning || '',
        rawResponse: groqData
    };

    const logId = await logGroqRequest(userId, username, requestPayload, model).catch(() => null);
    await logGroqResponse(logId, responseData, responseTimeMs, true).catch(() => null);

    return responseData;
}

async function checkGroqStatus() {
    const config = getGroqConfig();
    if (!config.apiKey) {
        return { configured: false, keyLength: 0, model: config.model || DEFAULT_GROQ_MODEL };
    }
    return { configured: true, keyLength: config.apiKey.length, model: config.model || DEFAULT_GROQ_MODEL };
}

async function logGroqInteraction(userId, username, requestPayload, responsePayload, responseTimeMs, success, errorMessage = null, model) {
    try {
        const logId = await logGroqRequest(userId, username, requestPayload, model);
        await logGroqResponse(logId, responsePayload, responseTimeMs, success, errorMessage);
    } catch (error) {
        logger.error('Failed to log GROQ interaction', { error: error.message });
    }
}

module.exports = {
    rateTask,
    checkGroqStatus,
    calculateXp
};
