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

function validateGoalCreate(req, res, next) {
    if (!req.body.title || typeof req.body.title !== 'string') {
        return res.status(400).json({ success: false, error: 'Goal title is required' });
    }
    
    const title = req.body.title.trim();
    if (title.length === 0) {
        return res.status(400).json({ success: false, error: 'Goal title cannot be empty' });
    }
    
    if (title.length > 200) {
        return res.status(400).json({ success: false, error: 'Goal title is too long' });
    }
    
    req.body.title = title;
    
    if (req.body.description !== undefined) {
        req.body.description = sanitizeString(req.body.description, 5000);
    }
    
    if (req.body.target_date !== undefined && req.body.target_date !== null) {
        const date = new Date(req.body.target_date);
        if (isNaN(date.getTime())) {
            return res.status(400).json({ success: false, error: 'Invalid target date' });
        }
        req.body.target_date = date.toISOString().split('T')[0];
    }
    
    const validCategories = ['personal', 'career', 'health', 'learning', 'finance', 'other'];
    if (req.body.category !== undefined && !validCategories.includes(req.body.category)) {
        return res.status(400).json({ success: false, error: 'Invalid category' });
    }
    
    req.body.category = req.body.category || 'personal';
    next();
}

function validateGoalUpdate(req, res, next) {
    if (req.body.title !== undefined) {
        const title = req.body.title.trim();
        if (title.length === 0) {
            return res.status(400).json({ success: false, error: 'Goal title cannot be empty' });
        }
        if (title.length > 200) {
            return res.status(400).json({ success: false, error: 'Goal title is too long' });
        }
        req.body.title = title;
    }
    
    if (req.body.description !== undefined) {
        req.body.description = sanitizeString(req.body.description, 5000);
    }
    
    if (req.body.target_date !== undefined && req.body.target_date !== null) {
        const date = new Date(req.body.target_date);
        if (isNaN(date.getTime())) {
            return res.status(400).json({ success: false, error: 'Invalid target date' });
        }
        req.body.target_date = date.toISOString().split('T')[0];
    }
    
    if (req.body.category !== undefined) {
        const validCategories = ['personal', 'career', 'health', 'learning', 'finance', 'other'];
        if (!validCategories.includes(req.body.category)) {
            return res.status(400).json({ success: false, error: 'Invalid category' });
        }
    }
    
    if (req.body.completed !== undefined) {
        req.body.completed = Boolean(req.body.completed);
    }
    
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

module.exports = {
    validateRegister,
    validateLogin,
    validateTaskCreate,
    validateTaskUpdate,
    validateUserUpdate,
    validateFriendAdd,
    validateGoalCreate,
    validateGoalUpdate,
    validateAiRate
};