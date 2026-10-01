const express = require('express');
const router = express.Router();
const groqController = require('../controllers/groqController');
const { authenticate } = require('../middleware/auth');
const { validateAiRate } = require('../middleware/validation');
const { aiRateLimiter } = require('../middleware/rateLimiter');

router.post('/', authenticate, aiRateLimiter, validateAiRate, groqController.rateTask);
router.post('/rate', authenticate, aiRateLimiter, validateAiRate, groqController.rateTask);
router.get('/status', groqController.getAiStatus);

module.exports = router;
