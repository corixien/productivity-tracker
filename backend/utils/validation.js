function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }
    if (trimmed.length > 30) {
        return { valid: false, error: 'Username must be at most 30 characters' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
    }
    return { valid: true, value: trimmed };
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }
    if (password.length < 4) {
        return { valid: false, error: 'Password must be at least 4 characters' };
    }
    if (password.length > 128) {
        return { valid: false, error: 'Password is too long' };
    }
    return { valid: true, value: password };
}

function validateTaskName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Task name is required' };
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Task name cannot be empty' };
    }
    if (trimmed.length > 200) {
        return { valid: false, error: 'Task name is too long' };
    }
    return { valid: true, value: trimmed };
}

function validateDuration(duration) {
    const parsed = parseInt(duration, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 1440) {
        return { valid: false, error: 'Duration must be between 1 and 1440 minutes' };
    }
    return { valid: true, value: parsed };
}

function validateProductivity(productivity) {
    const parsed = parseInt(productivity, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 5) {
        return { valid: false, error: 'Productivity must be between 0 and 5' };
    }
    return { valid: true, value: parsed };
}

function validateDifficulty(difficulty) {
    const parsed = parseInt(difficulty, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 5) {
        return { valid: false, error: 'Difficulty must be between 1 and 5' };
    }
    return { valid: true, value: parsed };
}

function validateCategory(category) {
    const validCategories = ['learning', 'exercise', 'creative', 'admin', 'social', 'deep-work', 'other'];
    if (!category || !validCategories.includes(category)) {
        return { valid: false, error: 'Invalid category' };
    }
    return { valid: true, value: category };
}

function validateLanguage(language) {
    const validLanguages = ['en', 'de'];
    if (!language || !validLanguages.includes(language)) {
        return { valid: false, error: 'Invalid language' };
    }
    return { valid: true, value: language };
}

function sanitizeString(str, maxLength = 1000) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().slice(0, maxLength);
}

module.exports = {
    validateUsername,
    validatePassword,
    validateTaskName,
    validateDuration,
    validateProductivity,
    validateDifficulty,
    validateCategory,
    validateLanguage,
    sanitizeString
};