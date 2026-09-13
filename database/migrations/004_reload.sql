ALTER TABLE users ADD COLUMN reload INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN times_reloaded INTEGER DEFAULT 0;
CREATE INDEX idx_users_reload ON users(reload);
