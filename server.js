const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const AVATARS_DIR = path.join(__dirname, 'avatars');
const aiRatingConfig = require('./js/ai-rating-config');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/avatars', express.static(AVATARS_DIR));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Failed to open database:', err);
    else console.log('Connected to SQLite database');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        rank TEXT DEFAULT 'Newcomer',
        friends TEXT DEFAULT '[]',
        language TEXT DEFAULT 'en',
        avatar TEXT,
        goals TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        duration INTEGER NOT NULL,
        hardness INTEGER NOT NULL,
        xp INTEGER NOT NULL,
        task_size TEXT DEFAULT 'medium',
        usefulness INTEGER DEFAULT 5,
        category TEXT DEFAULT 'other',
        completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
    )`);

    db.run(`ALTER TABLE tasks ADD COLUMN task_size TEXT DEFAULT 'medium'`, (err) => { if (err && !err.message.includes('duplicate column')) console.log('task_size column:', err.message); });
    db.run(`ALTER TABLE tasks ADD COLUMN usefulness INTEGER DEFAULT 5`, (err) => { if (err && !err.message.includes('duplicate column')) console.log('usefulness column:', err.message); });
    db.run(`ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT 'other'`, (err) => { if (err && !err.message.includes('duplicate column')) console.log('category column:', err.message); });
    
    db.run(`ALTER TABLE users ADD COLUMN goals TEXT DEFAULT ''`, (err) => { if (err && !err.message.includes('duplicate column')) console.log('goals column:', err.message); });
});

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function getUserByUsername(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else if (!row) resolve(null);
            else {
                try {
                    row.friends = JSON.parse(row.friends || '[]');
                } catch (e) {
                    row.friends = [];
                }
                resolve(row);
            }
        });
    });
}

function getUserTasks(username) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM tasks WHERE user_id = ?', [username], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function createUser(username, password) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, hashPassword(password)],
            function(err) {
                if (err) reject(err);
                else resolve({ username, id: this.lastID });
            }
        );
    });
}

function calculateXP(duration, hardness, taskSize, usefulness) {
    const sizeValue = aiRatingConfig.taskSizes[taskSize] || 20;
    return Math.round(sizeValue * (hardness / 10 + usefulness / 10) * duration / 10);
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password required' });
        }
        if (username.length < 3) {
            return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
        }
        if (password.length < 4) {
            return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
        }

        const existing = await getUserByUsername(username);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Username already taken' });
        }

        await createUser(username, password);
        res.json({ success: true, username, language: 'en' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password required' });
        }

        const user = await getUserByUsername(username);
        if (!user) {
            return res.status(400).json({ success: false, error: 'User not found' });
        }

        if (user.password_hash !== hashPassword(password)) {
            return res.status(400).json({ success: false, error: 'Incorrect password' });
        }

        res.json({ success: true, username: user.username, language: user.language });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

app.get('/api/users/:username', async (req, res) => {
    try {
        const user = await getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const { password_hash, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to get user' });
    }
});

app.put('/api/users/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const user = await getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const allowedFields = ['xp', 'level', 'rank', 'friends', 'language', 'avatar', 'goals'];
        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = typeof req.body[field] === 'object' ? JSON.stringify(req.body[field]) : req.body[field];
            }
        }

        if (req.body.newPassword) {
            updates.password_hash = hashPassword(req.body.newPassword);
        }

        if (Object.keys(updates).length === 0) {
            return res.json({ ...user, password_hash: undefined });
        }

        const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        await new Promise((resolve, reject) => {
            db.run(`UPDATE users SET ${setClause} WHERE username = ?`, [...values, username], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const updatedUser = await getUserByUsername(username);
        const { password_hash, ...safeUser } = updatedUser;
        res.json(safeUser);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

app.post('/api/users/:username/avatar', async (req, res) => {
    try {
        const { avatar } = req.body;
        if (!avatar) {
            return res.status(400).json({ success: false, error: 'No avatar data provided' });
        }

        const avatarPath = path.join(AVATARS_DIR, `${req.params.username}.png`);
        fs.writeFileSync(avatarPath, avatar, 'base64');

        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET avatar = ? WHERE username = ?', [`/avatars/${req.params.username}.png`, req.params.username], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, avatar: `/avatars/${req.params.username}.png` });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to upload avatar' });
    }
});

app.post('/api/users/:username/change-username', async (req, res) => {
    try {
        const { newUsername } = req.body;
        if (!newUsername || newUsername.length < 3) {
            return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
        }

        const oldUser = await getUserByUsername(req.params.username);
        if (!oldUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const existingUser = await getUserByUsername(newUsername);
        if (existingUser && existingUser.username.toLowerCase() !== req.params.username.toLowerCase()) {
            return res.status(400).json({ success: false, error: 'Username already taken' });
        }

        await new Promise((resolve, reject) => {
            db.run('INSERT OR REPLACE INTO users (username, password_hash, xp, level, rank, friends, language, avatar, goals, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [newUsername, oldUser.password_hash, oldUser.xp, oldUser.level, oldUser.rank, JSON.stringify(oldUser.friends || []), oldUser.language, oldUser.avatar, oldUser.goals || '', oldUser.created_at],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        const tasks = await getUserTasks(req.params.username);
        for (const task of tasks) {
            await new Promise((resolve, reject) => {
                db.run('UPDATE tasks SET user_id = ? WHERE id = ?', [newUsername, task.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        await new Promise((resolve, reject) => {
            db.run('DELETE FROM users WHERE username = ?', [req.params.username], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, newUsername });
    } catch (error) {
        console.error('Change username error:', error);
        res.status(500).json({ success: false, error: 'Failed to change username' });
    }
});

app.get('/api/tasks', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const tasks = await getUserTasks(userId);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

app.post('/api/tasks', async (req, res) => {
    try {
        const { userId, name, duration, hardness, taskSize, usefulness, category } = req.body;
        if (!userId || !name || !duration || !hardness) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const task = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
            userId,
            name,
            duration: parseInt(duration),
            hardness: parseInt(hardness),
            xp: calculateXP(duration, hardness, taskSize, usefulness),
            taskSize: taskSize || 'medium',
            usefulness: usefulness || 5,
            category: category || 'other',
            completed: 0,
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO tasks (id, user_id, name, duration, hardness, xp, task_size, usefulness, category, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [task.id, task.userId, task.name, task.duration, task.hardness, task.xp, task.taskSize, task.usefulness, task.category, task.completed, task.createdAt],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

app.put('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};
        if (req.body.completed !== undefined) updates.completed = req.body.completed ? 1 : 0;
        if (req.body.completedAt) updates.completed_at = req.body.completedAt;
        
        const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        await new Promise((resolve, reject) => {
            db.run(`UPDATE tasks SET ${setClause} WHERE id = ?`, [...values, id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const task = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const user = await getUserByUsername(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const friends = user.friends || [];
        const entries = [];

        for (const friend of friends) {
            const friendUser = await getUserByUsername(friend.username);
            if (friendUser) {
                const tasks = await getUserTasks(friend.username);
                const completedCount = tasks.filter(t => t.completed).length;
                entries.push({
                    username: friend.username,
                    avatar: friendUser.avatar || null,
                    xp: friendUser.xp || 0,
                    tasks: completedCount
                });
            }
        }

        const selfTasks = await getUserTasks(userId);
        const selfCompletedCount = selfTasks.filter(t => t.completed).length;
        entries.push({
            username: userId + ' (You)',
            avatar: user.avatar || null,
            xp: user.xp || 0,
            tasks: selfCompletedCount
        });

        entries.sort((a, b) => b.xp - a.xp);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

app.post('/api/friends', async (req, res) => {
    try {
        const { username, friendUsername } = req.body;
        if (!username || !friendUsername) {
            return res.status(400).json({ success: false, error: 'Missing usernames' });
        }
        if (friendUsername.toLowerCase() === username.toLowerCase()) {
            return res.status(400).json({ success: false, error: 'Cannot add yourself' });
        }

        const user = await getUserByUsername(username);
        const friend = await getUserByUsername(friendUsername);
        
        if (!friend) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (user.friends.some(f => f.username.toLowerCase() === friendUsername.toLowerCase())) {
            return res.status(400).json({ success: false, error: 'Already added' });
        }
        
        const updatedFriends = [...user.friends, { username: friendUsername, addedAt: new Date().toISOString() }];
        
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET friends = ? WHERE username = ?', [JSON.stringify(updatedFriends), username], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to add friend' });
    }
});

app.post('/api/ai/rate', async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            console.error('GROQ_API_KEY is not set');
            return res.status(500).json({ error: 'AI service is not configured on the server.' });
        }

        const { description, goals } = req.body;
        if (!description || !description.trim()) {
            return res.status(400).json({ error: 'Description is required' });
        }

        const goalsText = goals ? `\n\nUser's long-term goals:\n${goals}` : '';
        const userMessage = `${description.trim()}${goalsText}`;

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'groq/compound',
                messages: [
                    { role: 'system', content: aiRatingConfig.systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.1,
                max_tokens: 200
            })
        });

        if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            console.error('Groq API error:', groqResponse.status, errorText);
            if (groqResponse.status === 401) {
                return res.status(500).json({ error: 'AI service authentication failed. Check GROQ_API_KEY.' });
            }
            if (groqResponse.status === 404) {
                return res.status(500).json({ error: 'AI model not found. Check model name.' });
            }
            if (groqResponse.status === 429) {
                return res.status(500).json({ error: 'AI rate limit exceeded. Try again later.' });
            }
            return res.status(500).json({ 
                error: `AI service error (HTTP ${groqResponse.status})`,
                details: errorText 
            });
        }

        const groqData = await groqResponse.json();
        const content = groqData.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(500).json({ error: 'Empty AI response' });
        }

        let taskData;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                taskData = JSON.parse(jsonMatch[0]);
            } else {
                taskData = JSON.parse(content);
            }
        } catch (parseError) {
            console.error('Failed to parse AI response:', content);
            return res.status(500).json({ error: 'Invalid AI response format' });
        }

        if (!taskData.name || !taskData.duration || !taskData.hardness) {
            return res.status(500).json({ error: 'Incomplete task data from AI' });
        }

        const taskSize = taskData.taskSize || 'medium';
        const hardness = Math.max(1, Math.min(10, parseInt(taskData.hardness) || 5));
        const usefulness = Math.max(1, Math.min(10, parseInt(taskData.usefulness) || 5));
        const duration = Math.max(1, Math.min(1440, parseInt(taskData.duration) || 30));

        res.json({
            name: String(taskData.name).slice(0, 100),
            duration,
            hardness,
            taskSize,
            usefulness,
            category: taskData.category || 'other',
            xp: calculateXP(duration, hardness, taskSize, usefulness)
        });
    } catch (error) {
        console.error('AI rating error:', error);
        res.status(500).json({ error: 'AI service unavailable' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Productivity Tracker API running on http://0.0.0.0:${PORT}`);
});
