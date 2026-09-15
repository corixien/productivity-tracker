const User = require('../models/User');
const Task = require('../models/Task');
const { logError } = require('../services/loggingService');

async function getFriends(req, res) {
    try {
        const friends = await User.getFriends(req.user.id);
        return res.json(friends.map((friend) => ({
            id: friend.friend_id,
            username: friend.username,
            avatar: friend.avatar || friend.avatar_url || null,
            avatarUrl: friend.avatar_url || friend.avatar || null,
            addedAt: friend.added_at
        })));
    } catch (error) {
        await logError(error, { context: 'getFriends', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get friends' });
    }
}

async function addFriend(req, res) {
    try {
        const friend = await User.findByUsername(req.body.friendUsername);
        if (!friend) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (friend.id === req.user.id) {
            return res.status(400).json({ success: false, error: 'Cannot add yourself' });
        }
        if (await User.isFriend(req.user.id, friend.id)) {
            return res.status(409).json({ success: false, error: 'Already friends' });
        }
        await User.addFriend(req.user.id, friend.id);
        return res.json({ success: true });
    } catch (error) {
        await logError(error, { context: 'addFriend', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to add friend' });
    }
}

async function removeFriend(req, res) {
    try {
        const removed = await User.removeFriend(req.user.id, req.params.friendId);
        if (!removed) {
            return res.status(404).json({ success: false, error: 'Friend not found' });
        }
        return res.json({ success: true });
    } catch (error) {
        await logError(error, { context: 'removeFriend', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to remove friend' });
    }
}

async function getLeaderboard(req, res) {
    try {
        const identifier = req.query.userId || req.user.username;
        const requestedUser = await User.findByUsernameOrId(identifier);
        if (!requestedUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await User.recalculateMultiplier(requestedUser.id).catch(() => {});

        const friends = await User.getFriends(requestedUser.id);
        const entries = [];
        for (const friend of friends) {
            const friendUser = await User.findById(friend.friend_id);
            if (!friendUser) continue;
            entries.push({
                username: friendUser.username,
                avatar: friendUser.avatar || friendUser.avatar_url || null,
                xp: friendUser.xp || 0,
                tasks: await Task.getCompletedCount(friendUser.id),
                friendId: friend.friend_id
            });
        }

        entries.push({
            username: `${requestedUser.username}${requestedUser.id === req.user.id ? ' (You)' : ''}`,
            avatar: requestedUser.avatar || requestedUser.avatar_url || null,
            xp: requestedUser.xp || 0,
            tasks: await Task.getCompletedCount(requestedUser.id),
            friendId: null
        });
        entries.sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));
        return res.json(entries);
    } catch (error) {
        await logError(error, { context: 'getLeaderboard', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to load leaderboard' });
    }
}

async function getProfile(req, res) {
    try {
        const profile = await User.getUserProfile(req.user.id);
        return res.json(profile || {
            five_year_goal: '',
            productivity_preferences: {}
        });
    } catch (error) {
        await logError(error, { context: 'getProfile', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get profile' });
    }
}

async function monitorMultipliers(req, res) {
    try {
        const discrepancies = await User.monitorMultipliers(5).catch(() => []);
        return res.json({ success: true, discrepancies });
    } catch (error) {
        await logError(error, { context: 'monitorMultipliers', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to monitor multipliers' });
    }
}

async function updateProfile(req, res) {
    try {
        const profile = await User.upsertProfile(req.user.id, req.body);
        return res.json(profile);
    } catch (error) {
        await logError(error, { context: 'updateProfile', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
}

module.exports = {
    getFriends,
    addFriend,
    removeFriend,
    getLeaderboard,
    getProfile,
    updateProfile,
    monitorMultipliers
};
