const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { validateSettings } = require('../middleware/validation');

router.use(authenticate);
router.get('/', settingsController.getSettings);
router.put('/', validateSettings, settingsController.updateSettings);
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);

module.exports = router;
