const groqService = require('../services/groqService');
const User = require('../models/User');
const { logError } = require('../services/loggingService');

async function rateTask(req, res) {
    try {
        const { description, goals } = req.body;
        const user = await User.findById(req.user.id);

        const result = await groqService.rateTask(
            description,
            goals || (user?.goals || ''),
            req.user.id,
            req.user.username
        );

        return res.json(result);
    } catch (error) {
        await logError(error, { context: 'rateTask', userId: req.user.id });

        if (error.message.includes('GROQ_API_KEY')) {
            return res.status(503).json({
                success: false,
                error: 'AI service is not configured'
            });
        }

        if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
            return res.status(429).json({
                success: false,
                error: 'AI rate limit exceeded. Please try again in a minute.'
            });
        }

        if (error.message.includes('authentication') || error.message.includes('invalid API key')) {
            return res.status(503).json({
                success: false,
                error: 'AI service authentication failed'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'AI service unavailable'
        });
    }
}

async function getAiStatus(req, res) {
    try {
        const status = await groqService.checkGroqStatus();
        return res.json(status);
    } catch (error) {
        await logError(error, { context: 'getAiStatus' });
        return res.status(500).json({ success: false, error: 'Failed to get AI status' });
    }
}

module.exports = {
    rateTask,
    getAiStatus
};
