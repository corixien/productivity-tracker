const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const quickTaskController = require('../controllers/quickTaskController');
const { authenticate } = require('../middleware/auth');
const {
    validateFriendAdd,
    validateQuickTask,
    validateUserUpdate,
    validateChangePassword,
    validateChangeUsername
} = require('../middleware/validation');
const { friendRateLimiter, avatarRateLimiter, passwordRateLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// Fixed paths must stay above '/:username', or the param route shadows them.
router.get('/me', authController.getMe);
router.get('/friends', userController.getFriends);
router.post('/friends', friendRateLimiter, validateFriendAdd, userController.addFriend);
router.delete('/friends/:friendId', userController.removeFriend);
router.get('/leaderboard', userController.getLeaderboard);
router.post('/monitor-multipliers', userController.monitorMultipliers);

router.get('/quick-tasks', quickTaskController.getQuickTasks);
router.post('/quick-tasks', validateQuickTask, quickTaskController.createQuickTask);
router.put('/quick-tasks/:id', validateQuickTask, quickTaskController.updateQuickTask);
router.delete('/quick-tasks/:id', quickTaskController.deleteQuickTask);
router.post('/quick-tasks/:id/use', quickTaskController.useQuickTask);

router.get('/:username', authController.getUser);
router.put('/:username', validateUserUpdate, authController.updateUser);
router.post('/:username/password', passwordRateLimiter, validateChangePassword, authController.changePassword);
router.post('/:username/avatar', avatarRateLimiter, authController.uploadAvatar);
router.post('/:username/change-username', validateChangeUsername, authController.changeUsername);

module.exports = router;
