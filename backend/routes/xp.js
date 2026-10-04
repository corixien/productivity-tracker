const express = require('express');
const router = express.Router();
const xpController = require('../controllers/xpController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', xpController.getXp);
router.get('/stats', xpController.getStats);
router.get('/first-place', xpController.getFirstPlace);

module.exports = router;
