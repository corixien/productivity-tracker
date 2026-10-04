const { getGroqConfig } = require('../config');
const { query } = require('../utils/database');
const { logGroqRequest, logGroqResponse, logError } = require('../services/loggingService');
const { logger } = require('../utils/logger');
const { calculateXpFromTask } = require('./rankService');
const { warnOnError } = require('../utils/errors');

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;

// Models in order of preference when the configured one answers 404 (retired, or not enabled for this key's project).
const PREFERRED_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'qwen/qwen3-32b'];
const NOT_CHAT = /whisper|guard|safeguard|tts|orpheus|embed|rerank|transcri/i;
let workingModel = null;

// Asks Groq which models this key can use and picks the best chat model not yet tried.
async function pickAvailableModel(baseUrl, apiKey, tried) {
    try {
        const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) return null;
        const ids = ((await response.json()).data || []).map((model) => model.id).filter((id) => !NOT_CHAT.test(id) && !/compound/i.test(id) && !tried.has(id));
        return PREFERRED_MODELS.find((id) => ids.includes(id)) || ids[0] || null;
    } catch (error) {
        logger.warn('GROQ model list failed', { error: error.message });
        return null;
    }
}

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
    return calculateXpFromTask(duration, productivity, difficulty, bonus);
}

const LANGUAGE_NAMES = { en: 'English', de: 'German' };

async function rateTask(description, goals, userId, username, language = 'en') {
    const config = getGroqConfig();
    const apiKey = config.apiKey;
    let model = workingModel || config.model || DEFAULT_GROQ_MODEL;
    const triedModels = new Set([model]);
    const baseUrl = config.baseUrl;

    if (!apiKey) {
        throw new Error('GROQ_API_KEY is not configured');
    }

    const languageName = LANGUAGE_NAMES[language] || LANGUAGE_NAMES.en;
    const goalsText = goals ? `\n\nUser's long-term goals:\n${goals}` : '';
    const userMessage = `${description.trim()}${goalsText}`;

    const requestPayload = {
        model,
        messages: [
            { role: 'system', content: `Return ONLY this JSON (no other text, no markdown):

{"name":"short name","duration":minutes,"productivity":0-5,"difficulty":1-5,"category":"learning,exercise,creative,admin,social,deep-work,or other"}

Rules:
- name: write it in ${languageName}, whatever language the description is in (translate it if needed)
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
        max_tokens: 300
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

            // 404 = this model is retired or not enabled for the key: ask Groq for one that works and retry.
            if (groqResponse.status === 404) {
                const next = await pickAvailableModel(baseUrl, apiKey, triedModels);
                if (next) {
                    logger.warn(`GROQ model ${model} not found, switching to ${next}`);
                    triedModels.add(next);
                    model = next;
                    requestPayload.model = next;
                    continue;
                }
            }

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
        let upstream = '';
        try { upstream = JSON.parse(errorText).error.message || ''; } catch (parseError) { upstream = String(errorText).slice(0, 160); }
        let errorMessage = `GROQ API error (HTTP ${groqResponse?.status || 'N/A'})${upstream ? `: ${upstream.slice(0, 160)}` : ''}`;

        if (groqResponse?.status === 401) {
            errorMessage = 'GROQ authentication failed - invalid API key';
        } else if (groqResponse?.status === 404) {
            errorMessage = `GROQ model not found (${model})${upstream ? `: ${upstream.slice(0, 160)}` : ''}`;
        } else if (groqResponse?.status === 429) {
            errorMessage = 'GROQ rate limit exceeded';
        }

        await logGroqRequest(userId, username, requestPayload, model).catch(warnOnError('groqService.log'));
        await logGroqResponse(null, { error: errorText }, responseTimeMs, false, errorMessage).catch(warnOnError('groqService.log'));
        throw new Error(errorMessage);
    }

    let groqData;
    try {
        groqData = await groqResponse.json();
    } catch (error) {
        const errorMessage = 'Invalid JSON response from GROQ';
        await logGroqRequest(userId, username, requestPayload, model).catch(warnOnError('groqService.log'));
        await logGroqResponse(null, { error: error.message }, responseTimeMs, false, errorMessage).catch(warnOnError('groqService.log'));
        throw new Error(errorMessage);
    }

    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
        const errorMessage = 'Empty response from GROQ';
        await logGroqRequest(userId, username, requestPayload, model).catch(warnOnError('groqService.log'));
        await logGroqResponse(null, groqData, responseTimeMs, false, errorMessage).catch(warnOnError('groqService.log'));
        throw new Error(errorMessage);
    }

    let taskData;
    try {
        taskData = extractJsonFromResponse(content);
    } catch (parseError) {
        const errorMessage = 'Failed to parse GROQ response';
        await logGroqRequest(userId, username, requestPayload, model).catch(warnOnError('groqService.log'));
        await logGroqResponse(null, { raw: content }, responseTimeMs, false, errorMessage).catch(warnOnError('groqService.log'));
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
        reasoning: taskData.reasoning || ''
    };

    if (model !== (config.model || DEFAULT_GROQ_MODEL)) workingModel = model;
    const logId = await logGroqRequest(userId, username, requestPayload, model).catch(warnOnError('groqService.log'));
    await logGroqResponse(logId, responseData, responseTimeMs, true).catch(warnOnError('groqService.log'));

    return responseData;
}

async function checkGroqStatus() {
    const config = getGroqConfig();
    if (!config.apiKey) {
        return { configured: false, model: config.model || DEFAULT_GROQ_MODEL };
    }
    return { configured: true, model: config.model || DEFAULT_GROQ_MODEL };
}

async function logGroqInteraction(userId, username, requestPayload, responsePayload, responseTimeMs, success, errorMessage = null, model) {
    try {
        if (model !== (config.model || DEFAULT_GROQ_MODEL)) workingModel = model;
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
