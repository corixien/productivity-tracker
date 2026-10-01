const groqService = require('../services/groqService');
const User = require('../models/User');
const { asyncHandler, AppError } = require('../utils/errors');

const rateTask = asyncHandler(async (req, res) => {
    const { description, goals } = req.body;
    const user = await User.findById(req.user.id);

    try {
        res.json(await groqService.rateTask(description, goals || (user?.goals || ''), req.user.id, req.user.username));
    } catch (error) {
        const message = error.message || '';
        if (message.includes('GROQ_API_KEY')) throw new AppError(503, 'AI service is not configured', 'ai_not_configured');
        if (/rate limit/i.test(message)) throw new AppError(429, 'AI rate limit exceeded. Please try again in a minute.', 'ai_rate_limited');
        if (/authentication|invalid API key/i.test(message)) throw new AppError(503, 'AI service authentication failed', 'ai_auth_failed');
        throw new AppError(502, 'AI service unavailable', 'ai_unavailable');
    }
});

const getAiStatus = asyncHandler(async (req, res) => {
    res.json(await groqService.checkGroqStatus());
});

module.exports = { rateTask, getAiStatus };
