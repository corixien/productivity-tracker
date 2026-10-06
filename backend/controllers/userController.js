const User = require('../models/User');
const Task = require('../models/Task');
const { getFirstPlace } = require('../services/firstPlaceService');
const { logActivity } = require('../services/loggingService');
const { awardWeeklyTrophies } = require('../services/bonusService');
const { asyncHandler, notFound, badRequest, conflict, warnOnError } = require('../utils/errors');

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
    await awardWeeklyTrophies().catch(warnOnError('leaderboard.trophies'));
    res.json(await User.getLeaderboard(req.user.id, period, req.tz));
});

// Profile page of yourself or a friend: public fields, streak/week stats, first place streaks, completed tasks.
const getProfile = asyncHandler(async (req, res) => {
    const target = await User.findByUsername(req.params.username);
    // Strangers look the same as missing users.
    if (!target || (target.id !== req.user.id && !await User.isFriend(req.user.id, target.id))) throw notFound('User not found');
    const [stats, firstPlace, tasks] = await Promise.all([
        Task.getStats(target.id, req.tz),
        getFirstPlace(target.id, req.tz),
        Task.getCompletedWithXp(target.id)
    ]);
    res.json({
        user: {
            username: target.username,
            avatar: target.avatar || null,
            xp: target.xp || 0,
            level: target.level || 0,
            rank: target.rank,
            tasks: target.tasks_completed || 0,
            isSelf: target.id === req.user.id
        },
        stats,
        firstPlace,
        tasks
    });
});

const monitorMultipliers = asyncHandler(async (req, res) => {
    res.json({ success: true, discrepancies: await User.monitorMultipliers(5) });
});

module.exports = {
    getFriends,
    addFriend,
    removeFriend,
    getLeaderboard,
    getProfile,
    monitorMultipliers
};
