-- Token versioning: bump on password change to invalidate old JWTs
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- Daily XP goal
ALTER TABLE users ADD COLUMN daily_goal_xp INTEGER NOT NULL DEFAULT 50 CHECK (daily_goal_xp BETWEEN 10 AND 5000);

-- Recurring templates
ALTER TABLE quick_tasks ADD COLUMN recurrence VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly'));
ALTER TABLE quick_tasks ADD COLUMN last_spawned_on DATE;

-- The app recomputes XP from xp_history inside its own transaction; the trigger duplicated that.
DROP TRIGGER IF EXISTS tasks_delete_recalc_xp ON tasks;
DROP FUNCTION IF EXISTS recalculate_user_xp_after_task_delete();

-- Indexes for history, streak and weekly queries
CREATE INDEX IF NOT EXISTS idx_xp_history_user_created ON xp_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_history_source_id ON xp_history (source_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_at ON tasks (user_id, completed_at DESC) WHERE completed = true;
