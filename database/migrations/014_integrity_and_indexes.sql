-- Integrity and index tidy-up. No app behavior changes except that usernames are unique ignoring case.

-- 1. Check old xp_history rows against the known sources too (the constraint was added NOT VALID in 011).
DO $$
BEGIN
    ALTER TABLE xp_history VALIDATE CONSTRAINT xp_history_source_known;
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'xp_history: rows with an unknown source exist, constraint left NOT VALID';
END $$;

-- 2. Case-insensitive unique usernames. The app already looks them up with lower(); now the database enforces it.
--    Skipped with a notice when two existing names differ only in case (resolve those by hand, then rerun the CREATE).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users GROUP BY lower(username) HAVING COUNT(*) > 1) THEN
        RAISE NOTICE 'users: usernames that differ only in case exist, unique lower(username) index not created';
    ELSE
        DROP INDEX IF EXISTS idx_users_username_lower;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
    END IF;
END $$;

-- 3. Closed value sets (rank is derived from xp by trigger, so it is always valid).
UPDATE users SET language = 'en' WHERE language NOT IN ('en', 'de');
ALTER TABLE users ADD CONSTRAINT users_language_known CHECK (language IN ('en', 'de'));
ALTER TABLE users ADD CONSTRAINT users_rank_known
    CHECK (rank IN ('Newcomer', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'));

-- 4. Friends: look up "who added me" without scanning (the primary key only covers user_id first).
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends (friend_id);

-- 5. Covering index: history pages, per-user sums and the weekly leaderboard are answered from the index alone.
DROP INDEX IF EXISTS idx_xp_history_user_created;
CREATE INDEX idx_xp_history_user_created ON xp_history (user_id, created_at DESC) INCLUDE (xp_amount);

-- 6. Pending list is the hot query.
CREATE INDEX IF NOT EXISTS idx_tasks_user_pending ON tasks (user_id, created_at DESC) WHERE completed = false;

-- 7. Drop indexes that another index already covers (less write cost and storage).
DROP INDEX IF EXISTS idx_tasks_user_id;            -- prefix of idx_tasks_user_completed
DROP INDEX IF EXISTS idx_xp_history_user_id;       -- prefix of idx_xp_history_user_created
DROP INDEX IF EXISTS idx_tasks_created_at;         -- never filtered without user_id
DROP INDEX IF EXISTS idx_xp_history_created_at;    -- never filtered without user_id
DROP INDEX IF EXISTS idx_friends_user_id;          -- prefix of the primary key
DROP INDEX IF EXISTS idx_templates_user_id;        -- prefix of idx_templates_unique

-- 8. Drift detector: lists users whose stored totals disagree with the data they are derived from.
--    Empty result = consistent. Visible in the admin database page like any other view.
CREATE OR REPLACE VIEW v_user_integrity AS
SELECT u.id AS user_id, u.username,
       u.xp AS stored_xp, COALESCE(h.total, 0) AS history_xp,
       u.tasks_completed AS stored_tasks, COALESCE(t.done, 0) AS real_tasks
FROM users u
LEFT JOIN (SELECT user_id, SUM(xp_amount)::int AS total FROM xp_history GROUP BY user_id) h ON h.user_id = u.id
LEFT JOIN (SELECT user_id, COUNT(*)::int AS done FROM tasks WHERE completed GROUP BY user_id) t ON t.user_id = u.id
WHERE u.xp <> COALESCE(h.total, 0) OR u.tasks_completed <> COALESCE(t.done, 0);

COMMENT ON COLUMN xp_history.source_id IS 'Task id for task sources. No foreign key on purpose: history must survive task deletion.';
COMMENT ON VIEW v_user_integrity IS 'Users whose xp or tasks_completed disagree with xp_history / tasks. Should be empty.';
