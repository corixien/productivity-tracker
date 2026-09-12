const DEFAULT_GROQ_MODEL = 'groq/compound';

function requireEnvironment(name) {
    const value = process.env[name];
    if (!value || value === 'undefined' || value.trim() === '') {
        throw new Error(`${name} environment variable is required`);
    }
    return value;
}

function getDatabaseConfig() {
    return {
        connectionString: requireEnvironment('DATABASE_URL'),
        ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
            : false
    };
}

function getGroqConfig() {
    return {
        apiKey: process.env.GROQ_API_KEY || '',
        model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
        baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '')
    };
}

function getAuthConfig() {
    return {
        secret: requireEnvironment('JWT_SECRET'),
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    };
}

module.exports = {
    DEFAULT_GROQ_MODEL,
    getDatabaseConfig,
    getGroqConfig,
    getAuthConfig,
    requireEnvironment
};
