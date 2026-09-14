const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validateFriendAdd } = require('../middleware/validation');

router.use(authenticate);

router.get('/me', authController.getMe);
router.get('/friends', userController.getFriends);
router.post('/friends', validateFriendAdd, userController.addFriend);
router.delete('/friends/:friendId', userController.removeFriend);
router.get('/leaderboard', userController.getLeaderboard);
router.post('/monitor-multipliers', userController.monitorMultipliers);
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.get('/:username', optionalAuth, authController.getUser);
router.put('/:username', authController.updateUser);
router.post('/:username/password', authController.changePassword);
router.post('/:username/avatar', authController.uploadAvatar);
router.post('/:username/change-username', authController.changeUsername);

module.exports = router;
