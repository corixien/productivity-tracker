const groqService = require('../services/groqService');
const User = require('../models/User');
const { logActivity } = require('../services/loggingService');
const { asyncHandler, AppError } = require('../utils/errors');

const rateTask = asyncHandler(async (req, res) => {
    const { description, goals } = req.body;
    const user = await User.findById(req.user.id);
    // The task name is written in the language the user has selected (the app sends it; the saved setting is the fallback).
    const language = ['en', 'de'].includes(req.body.language) ? req.body.language : (user && user.language) || 'en';

    const startedAt = Date.now();
    try {
        const result = await groqService.rateTask(description, goals || (user?.goals || ''), req.user.id, req.user.username, language);
        await logActivity({
            userId: req.user.id, action: 'ai.rate',
            message: `AI rated "${description.slice(0, 60)}" = ${result.duration} min, productivity ${result.productivity}, difficulty ${result.difficulty}`,
            meta: { ms: Date.now() - startedAt, result: { name: result.name, category: result.category, xp: result.xp } }
        });
        res.json(result);
    } catch (error) {
        await logActivity({
            userId: req.user.id, action: 'ai.error', level: 'warn', message: `AI rating failed: ${error.message}`,
            meta: { ms: Date.now() - startedAt, description: description.slice(0, 200) }
        });
        const message = error.message || '';
        if (message.includes('GROQ_API_KEY')) throw new AppError(503, 'AI service is not configured', 'ai_not_configured');
        if (/rate limit/i.test(message)) throw new AppError(429, 'AI rate limit exceeded. Please try again in a minute.', 'ai_rate_limited');
        if (/authentication|invalid API key/i.test(message)) throw new AppError(503, 'AI service authentication failed', 'ai_auth_failed');
        // The reason (HTTP status and Groq's own message, never a secret) goes to the client so a production failure is diagnosable.
        throw new AppError(502, `AI service unavailable: ${message.replace(/^GROQ /, '').slice(0, 200)}`, 'ai_unavailable');
    }
});

const getAiStatus = asyncHandler(async (req, res) => {
    res.json(await groqService.checkGroqStatus());
});

module.exports = { rateTask, getAiStatus };
