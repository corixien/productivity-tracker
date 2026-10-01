CREATE TABLE quick_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    duration INTEGER NOT NULL CHECK (duration > 0 AND duration <= 1440),
    productivity INTEGER DEFAULT 0 CHECK (productivity >= 0 AND productivity <= 5),
    difficulty INTEGER DEFAULT 3 CHECK (difficulty >= 1 AND difficulty <= 5),
    category VARCHAR(20) DEFAULT 'other' CHECK (category IN ('learning', 'exercise', 'creative', 'admin', 'social', 'deep-work', 'other')),
    bonus INTEGER DEFAULT 0 CHECK (bonus >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_quick_tasks_user_id ON quick_tasks (user_id);

CREATE TRIGGER update_quick_tasks_updated_at BEFORE UPDATE ON quick_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();