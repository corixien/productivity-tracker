const User = require('../models/User');
const { logActivity } = require('../services/loggingService');
const { asyncHandler, notFound, badRequest, conflict } = require('../utils/errors');

const getFriends = asyncHandler(async (req, res) => {
    const friends = await User.getFriends(req.user.id);
    res.json(friends.map((friend) => ({
        id: friend.friend_id,
        username: friend.username,
        avatar: friend.avatar || friend.avatar_url || null,
        avatarUrl: friend.avatar_url || friend.avatar || null,
        addedAt: friend.added_at
    })));
});

const addFriend = asyncHandler(async (req, res) => {
    const friend = await User.findByUsername(req.body.friendUsername);
    if (!friend) throw notFound('User not found');
    if (friend.id === req.user.id) throw badRequest('Cannot add yourself');
    if (await User.isFriend(req.user.id, friend.id)) throw conflict('Already friends');
    await User.addFriend(req.user.id, friend.id);
    await User.recalculateMultiplier(req.user.id, true);
    await logActivity({ userId: req.user.id, action: 'friend.add', message: `Added friend ${friend.username}`, meta: { friendId: friend.id } });
    res.json({ success: true });
});

const removeFriend = asyncHandler(async (req, res) => {
    const removed = await User.removeFriend(req.user.id, req.params.friendId);
    if (!removed) throw notFound('Friend not found');
    await User.recalculateMultiplier(req.user.id, true);
    await logActivity({ userId: req.user.id, action: 'friend.remove', message: 'Removed a friend', meta: { friendId: req.params.friendId } });
    res.json({ success: true });
});

const getLeaderboard = asyncHandler(async (req, res) => {
    const period = req.query.period === 'week' ? 'week' : 'all';
    User.monitorMultipliersThrottled();
    res.json(await User.getLeaderboard(req.user.id, period, req.tz));
});

const monitorMultipliers = asyncHandler(async (req, res) => {
    res.json({ success: true, discrepancies: await User.monitorMultipliers(5) });
});

module.exports = {
    getFriends,
    addFriend,
    removeFriend,
    getLeaderboard,
    monitorMultipliers
};
