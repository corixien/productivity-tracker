const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');
const { validateSettings } = require('../middleware/validation');

router.use(authenticate);
router.get('/', settingsController.getSettings);
router.put('/', validateSettings, settingsController.updateSettings);

module.exports = router;
