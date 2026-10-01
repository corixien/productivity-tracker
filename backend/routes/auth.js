const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validation');
const { authRateLimiter } = require('../middleware/rateLimiter');

router.post('/register', authRateLimiter, validateRegister, authController.register);
router.post('/login', authRateLimiter, validateLogin, authController.login);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
