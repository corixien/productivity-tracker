-- Productivity Tracker PostgreSQL schema for Supabase

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(30) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    language VARCHAR(5) DEFAULT 'en' NOT NULL,
    xp INTEGER DEFAULT 0 NOT NULL CHECK (xp >= 0),
    level INTEGER DEFAULT 0 NOT NULL CHECK (level >= 0),
    rank VARCHAR(20) DEFAULT 'Newcomer' NOT NULL,
    goals TEXT DEFAULT '' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    five_year_goal TEXT DEFAULT '' NOT NULL,
    productivity_preferences JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_text TEXT NOT NULL,
    name VARCHAR(200) NOT NULL,
    ai_score INTEGER DEFAULT 0 CHECK (ai_score >= 0 AND ai_score <= 5),
    xp_awarded INTEGER DEFAULT 0 NOT NULL CHECK (xp_awarded >= 0),
    duration INTEGER NOT NULL CHECK (duration > 0 AND duration <= 1440),
    productivity INTEGER DEFAULT 0 CHECK (productivity >= 0 AND productivity <= 5),
    difficulty INTEGER DEFAULT 3 CHECK (difficulty >= 1 AND difficulty <= 5),
    category VARCHAR(20) DEFAULT 'other' CHECK (category IN ('learning', 'exercise', 'creative', 'admin', 'social', 'deep-work', 'other')),
    bonus INTEGER DEFAULT 0 CHECK (bonus >= 0),
    completed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE TABLE xp_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    xp_amount INTEGER NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE friends (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, friend_id),
    CHECK (user_id <> friend_id)
);

CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '' NOT NULL,
    target_date DATE,
    category VARCHAR(20) DEFAULT 'personal' CHECK (category IN ('personal', 'career', 'health', 'learning', 'finance', 'other')),
    completed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE groq_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(30),
    request_payload JSONB NOT NULL,
    response_payload JSONB,
    response_time_ms INTEGER CHECK (response_time_ms >= 0),
    model VARCHAR(100),
    success BOOLEAN NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_users_username_lower ON users (LOWER(username));
CREATE INDEX idx_profiles_user_id ON profiles (user_id);
CREATE INDEX idx_tasks_user_id ON tasks (user_id);
CREATE INDEX idx_tasks_user_completed ON tasks (user_id, completed);
CREATE INDEX idx_tasks_created_at ON tasks (created_at DESC);
CREATE INDEX idx_xp_history_user_id ON xp_history (user_id);
CREATE INDEX idx_xp_history_created_at ON xp_history (created_at DESC);
CREATE INDEX idx_friends_user_id ON friends (user_id);
CREATE INDEX idx_goals_user_id ON goals (user_id);
CREATE INDEX idx_groq_logs_user_id ON groq_logs (user_id);
CREATE INDEX idx_groq_logs_created_at ON groq_logs (created_at DESC);
CREATE INDEX idx_system_logs_created_at ON system_logs (created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
