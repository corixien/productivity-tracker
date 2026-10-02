const { validateUsername, validatePassword, validateTaskName, validateDuration, validateProductivity, validateDifficulty, validateCategory, validateLanguage, sanitizeString } = require('../utils/validation');

function validateRegister(req, res, next) {
    const usernameValidation = validateUsername(req.body.username);
    if (!usernameValidation.valid) {
        return res.status(400).json({ success: false, error: usernameValidation.error });
    }
    
    const passwordValidation = validatePassword(req.body.password);
    if (!passwordValidation.valid) {
        return res.status(400).json({ success: false, error: passwordValidation.error });
    }
    
    req.body.username = usernameValidation.value;
    req.body.password = passwordValidation.value;
    next();
}

function validateLogin(req, res, next) {
    const usernameValidation = validateUsername(req.body.username);
    if (!usernameValidation.valid) {
        return res.status(400).json({ success: false, error: usernameValidation.error });
    }
    
    const passwordValidation = validatePassword(req.body.password);
    if (!passwordValidation.valid) {
        return res.status(400).json({ success: false, error: passwordValidation.error });
    }
    
    req.body.username = usernameValidation.value;
    req.body.password = passwordValidation.value;
    next();
}

function validateTaskCreate(req, res, next) {
    const nameValidation = validateTaskName(req.body.name);
    if (!nameValidation.valid) {
        return res.status(400).json({ success: false, error: nameValidation.error });
    }
    
    const durationValidation = validateDuration(req.body.duration);
    if (!durationValidation.valid) {
        return res.status(400).json({ success: false, error: durationValidation.error });
    }
    
    if (req.body.productivity !== undefined) {
        const prodValidation = validateProductivity(req.body.productivity);
        if (!prodValidation.valid) {
            return res.status(400).json({ success: false, error: prodValidation.error });
        }
        req.body.productivity = prodValidation.value;
    } else {
        req.body.productivity = 0;
    }
    
    if (req.body.difficulty !== undefined) {
        const diffValidation = validateDifficulty(req.body.difficulty);
        if (!diffValidation.valid) {
            return res.status(400).json({ success: false, error: diffValidation.error });
        }
        req.body.difficulty = diffValidation.value;
    } else {
        req.body.difficulty = 3;
    }
    
    if (req.body.category !== undefined) {
        const catValidation = validateCategory(req.body.category);
        if (!catValidation.valid) {
            return res.status(400).json({ success: false, error: catValidation.error });
        }
        req.body.category = catValidation.value;
    } else {
        req.body.category = 'other';
    }
    
    if (req.body.bonus !== undefined) {
        const bonus = parseInt(req.body.bonus, 10);
        if (isNaN(bonus) || bonus < 0) {
            return res.status(400).json({ success: false, error: 'Bonus must be a non-negative number' });
        }
        req.body.bonus = bonus;
    } else {
        req.body.bonus = 0;
    }
    
    req.body.name = nameValidation.value;
    req.body.duration = durationValidation.value;
    next();
}

function validateTaskUpdate(req, res, next) {
    if (req.body.name !== undefined) {
        const nameValidation = validateTaskName(req.body.name);
        if (!nameValidation.valid) {
            return res.status(400).json({ success: false, error: nameValidation.error });
        }
        req.body.name = nameValidation.value;
    }
    
    if (req.body.duration !== undefined) {
        const durationValidation = validateDuration(req.body.duration);
        if (!durationValidation.valid) {
            return res.status(400).json({ success: false, error: durationValidation.error });
        }
        req.body.duration = durationValidation.value;
    }
    
    if (req.body.productivity !== undefined) {
        const prodValidation = validateProductivity(req.body.productivity);
        if (!prodValidation.valid) {
            return res.status(400).json({ success: false, error: prodValidation.error });
        }
        req.body.productivity = prodValidation.value;
    }
    
    if (req.body.difficulty !== undefined) {
        const diffValidation = validateDifficulty(req.body.difficulty);
        if (!diffValidation.valid) {
            return res.status(400).json({ success: false, error: diffValidation.error });
        }
        req.body.difficulty = diffValidation.value;
    }
    
    if (req.body.category !== undefined) {
        const catValidation = validateCategory(req.body.category);
        if (!catValidation.valid) {
            return res.status(400).json({ success: false, error: catValidation.error });
        }
        req.body.category = catValidation.value;
    }
    
    if (req.body.bonus !== undefined) {
        const bonus = parseInt(req.body.bonus, 10);
        if (isNaN(bonus) || bonus < 0) {
            return res.status(400).json({ success: false, error: 'Bonus must be a non-negative number' });
        }
        req.body.bonus = bonus;
    }
    
    if (req.body.completed !== undefined) {
        req.body.completed = Boolean(req.body.completed);
    }
    
    next();
}

function validateUserUpdate(req, res, next) {
    if (req.body.language !== undefined) {
        const langValidation = validateLanguage(req.body.language);
        if (!langValidation.valid) {
            return res.status(400).json({ success: false, error: langValidation.error });
        }
        req.body.language = langValidation.value;
    }
    
    if (req.body.goals !== undefined) {
        req.body.goals = sanitizeString(req.body.goals, 5000);
    }
    
    if (req.body.newPassword !== undefined) {
        const passValidation = validatePassword(req.body.newPassword);
        if (!passValidation.valid) {
            return res.status(400).json({ success: false, error: passValidation.error });
        }
        req.body.newPassword = passValidation.value;
    }
    
    next();
}

function validateFriendAdd(req, res, next) {
    const friendValidation = validateUsername(req.body.friendUsername);
    if (!friendValidation.valid) {
        return res.status(400).json({ success: false, error: friendValidation.error });
    }
    req.body.friendUsername = friendValidation.value;
    next();
}

function validateAiRate(req, res, next) {
    if (!req.body.description || typeof req.body.description !== 'string') {
        return res.status(400).json({ success: false, error: 'Description is required' });
    }
    
    const description = req.body.description.trim();
    if (description.length === 0) {
        return res.status(400).json({ success: false, error: 'Description cannot be empty' });
    }
    
    if (description.length > 2000) {
        return res.status(400).json({ success: false, error: 'Description is too long' });
    }
    
    req.body.description = description;
    
    if (req.body.goals !== undefined) {
        req.body.goals = sanitizeString(req.body.goals, 5000);
    }
    
    next();
}

function validateQuickTask(req, res, next) {
    const partial = req.method === 'PUT';
    const body = req.body;
    const out = {};
    const fail = (error) => res.status(400).json({ success: false, error, code: 'validation_error' });

    if (!partial || body.name !== undefined) {
        const v = validateTaskName(body.name);
        if (!v.valid) return fail(v.error);
        out.name = v.value;
    }
    if (!partial || body.duration !== undefined) {
        const v = validateDuration(body.duration);
        if (!v.valid) return fail(v.error);
        out.duration = v.value;
    }
    if (!partial || body.productivity !== undefined) {
        const v = validateProductivity(body.productivity === undefined ? 0 : body.productivity);
        if (!v.valid) return fail(v.error);
        out.productivity = v.value;
    }
    if (!partial || body.difficulty !== undefined) {
        const v = validateDifficulty(body.difficulty === undefined ? 3 : body.difficulty);
        if (!v.valid) return fail(v.error);
        out.difficulty = v.value;
    }
    if (!partial || body.category !== undefined) {
        const v = validateCategory(body.category === undefined ? 'other' : body.category);
        if (!v.valid) return fail(v.error);
        out.category = v.value;
    }
    if (!partial || body.bonus !== undefined) {
        const bonus = body.bonus === undefined ? 0 : parseInt(body.bonus, 10);
        if (isNaN(bonus) || bonus < 0) return fail('Bonus must be a non-negative number');
        out.bonus = bonus;
    }
    req.body = out;
    next();
}

function validateChangePassword(req, res, next) {
    const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    if (!current) {
        return res.status(400).json({ success: false, error: 'Current password is required', code: 'validation_error' });
    }
    const v = validatePassword(req.body.newPassword);
    if (!v.valid) {
        return res.status(400).json({ success: false, error: v.error, code: 'validation_error' });
    }
    req.body.currentPassword = current;
    req.body.newPassword = v.value;
    next();
}

function validateChangeUsername(req, res, next) {
    const v = validateUsername(req.body.newUsername);
    if (!v.valid) {
        return res.status(400).json({ success: false, error: v.error, code: 'validation_error' });
    }
    req.body.newUsername = v.value;
    next();
}

function validateSettings(req, res, next) {
    if (req.body.language !== undefined) {
        const v = validateLanguage(req.body.language);
        if (!v.valid) return res.status(400).json({ success: false, error: v.error, code: 'validation_error' });
    }
    if (req.body.goals !== undefined) {
        req.body.goals = sanitizeString(String(req.body.goals), 5000);
    }
    if (req.body.dailyGoalXp !== undefined) {
        const goal = parseInt(req.body.dailyGoalXp, 10);
        if (isNaN(goal) || goal < 10 || goal > 5000) {
            return res.status(400).json({ success: false, error: 'Daily goal must be between 10 and 5000 XP', code: 'validation_error' });
        }
        req.body.dailyGoalXp = goal;
    }
    next();
}

module.exports = {
    validateQuickTask,
    validateChangePassword,
    validateChangeUsername,
    validateSettings,
    validateRegister,
    validateLogin,
    validateTaskCreate,
    validateTaskUpdate,
    validateUserUpdate,
    validateFriendAdd,
    validateAiRate
};