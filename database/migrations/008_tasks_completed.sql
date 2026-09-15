ALTER TABLE users ADD COLUMN tasks_completed INTEGER DEFAULT 0 NOT NULL CHECK (tasks_completed >= 0);
