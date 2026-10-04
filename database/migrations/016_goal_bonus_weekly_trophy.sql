-- Daily goal bonus and weekly winner trophy: two new xp_history sources, plus a table that settles each week once.
ALTER TABLE xp_history DROP CONSTRAINT IF EXISTS xp_history_source_known;
ALTER TABLE xp_history ADD CONSTRAINT xp_history_source_known
    CHECK (source IN ('task', 'task_uncomplete', 'task_delete', 'task_edit', 'admin_adjust', 'daily_goal', 'weekly_trophy'));

-- One row per settled week (week_start = Monday of that week in the trophy timezone).
-- user_id is NULL when nobody qualified; the row still marks the week as settled.
CREATE TABLE IF NOT EXISTS weekly_trophies (
    week_start DATE PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    xp_amount INTEGER NOT NULL DEFAULT 0,
    week_xp INTEGER NOT NULL DEFAULT 0,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weekly_trophies_user ON weekly_trophies (user_id, week_start DESC);

COMMENT ON TABLE weekly_trophies IS 'Weekly winner trophy: settled lazily on the first request after Sunday turns to Monday (TROPHY_TIMEZONE).';
COMMENT ON COLUMN xp_history.source IS 'task, task_uncomplete, task_delete, task_edit, admin_adjust, daily_goal (goal bonus, negative when taken back), weekly_trophy.';
