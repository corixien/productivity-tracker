const express = require('express');
const router = express.Router();
const groqController = require('../controllers/groqController');
const { authenticate } = require('../middleware/auth');
const { validateAiRate } = require('../middleware/validation');

router.post('/', authenticate, validateAiRate, groqController.rateTask);
router.post('/rate', authenticate, validateAiRate, groqController.rateTask);
router.get('/status', groqController.getAiStatus);

module.exports = router;
