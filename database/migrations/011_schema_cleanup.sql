-- Schema cleanup and links between columns.
-- Removes duplicated/derived columns and unused tables, adds admin/analytics support and moves
-- the rank <-> xp <-> level and tasks_completed <-> tasks relations into the database itself,
-- so they hold no matter who edits a row (app, admin page or SQL console).

-- 1. Recurring templates are gone
ALTER TABLE quick_tasks DROP COLUMN IF EXISTS recurrence, DROP COLUMN IF EXISTS last_spawned_on;

-- 2. profiles duplicated users.goals: keep the text on users, drop the table
UPDATE users u SET goals = p.five_year_goal
FROM profiles p
WHERE p.user_id = u.id AND p.five_year_goal <> '' AND (u.goals IS NULL OR u.goals = '');
DROP TABLE IF EXISTS profiles;

-- 3. Unused long-term goals feature (no UI ever used it)
DROP TABLE IF EXISTS goals;

-- 4. Duplicated or derivable columns
ALTER TABLE users DROP COLUMN IF EXISTS position_based_multiplier, DROP COLUMN IF EXISTS rank_based_multiplier;
ALTER TABLE tasks DROP COLUMN IF EXISTS task_text, DROP COLUMN IF EXISTS ai_score;

-- 5. New columns and tables
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;

ALTER TABLE system_logs ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE system_logs ADD COLUMN username VARCHAR(30);
ALTER TABLE system_logs ADD COLUMN action VARCHAR(40);
CREATE INDEX idx_system_logs_action ON system_logs (action, created_at DESC);
CREATE INDEX idx_system_logs_user ON system_logs (user_id, created_at DESC);

CREATE TABLE uptime_samples (sampled_at TIMESTAMPTZ PRIMARY KEY);
CREATE TABLE user_activity (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hour TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, hour)
);
CREATE INDEX idx_user_activity_hour ON user_activity (hour);

-- 6. Integrity: completed flag and timestamp always agree; known XP sources only (existing rows are not re-checked)
UPDATE tasks SET completed_at = NULL WHERE NOT completed AND completed_at IS NOT NULL;
UPDATE tasks SET completed_at = COALESCE(updated_at, created_at) WHERE completed AND completed_at IS NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_completed_matches_timestamp CHECK (completed = (completed_at IS NOT NULL));
ALTER TABLE xp_history ADD CONSTRAINT xp_history_source_known
    CHECK (source IN ('task', 'task_uncomplete', 'task_delete', 'task_edit', 'admin_adjust')) NOT VALID;

-- 7. Rank thresholds in SQL (must match backend/services/rankService.js; an integration test checks it)
CREATE FUNCTION rank_for_xp(p_xp INTEGER) RETURNS VARCHAR LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_xp >= 5000 THEN 'Master' WHEN p_xp >= 2400 THEN 'Diamond' WHEN p_xp >= 1200 THEN 'Platinum'
        WHEN p_xp >= 600 THEN 'Gold' WHEN p_xp >= 300 THEN 'Silver' WHEN p_xp >= 100 THEN 'Bronze'
        ELSE 'Newcomer' END
$$;

CREATE FUNCTION rank_min_xp(p_rank VARCHAR) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_rank WHEN 'Newcomer' THEN 0 WHEN 'Bronze' THEN 100 WHEN 'Silver' THEN 300 WHEN 'Gold' THEN 600
        WHEN 'Platinum' THEN 1200 WHEN 'Diamond' THEN 2400 WHEN 'Master' THEN 5000 END
$$;

CREATE FUNCTION rank_max_xp(p_rank VARCHAR) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_rank WHEN 'Newcomer' THEN 99 WHEN 'Bronze' THEN 299 WHEN 'Silver' THEN 599 WHEN 'Gold' THEN 1199
        WHEN 'Platinum' THEN 2399 WHEN 'Diamond' THEN 4999 END
$$;

-- Backfill derived values before the triggers exist
UPDATE users SET rank = rank_for_xp(xp), level = xp / 100,
    tasks_completed = (SELECT COUNT(*) FROM tasks t WHERE t.user_id = users.id AND t.completed);

-- 8. users: xp, rank, level and tasks_completed stay consistent
--  * xp changed       -> rank and level follow
--  * rank changed     -> xp is moved into that rank's range (lowering a rank lowers xp)
--  * tasks_completed lowered -> oldest completed tasks are deleted and their XP taken back
--    (0 removes all completed tasks); raising it above the real number is capped
CREATE FUNCTION users_sync_progress() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    actual INTEGER;
    removed INTEGER := 0;
    awarded INTEGER;
    doomed RECORD;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.tasks_completed IS DISTINCT FROM OLD.tasks_completed THEN
        SELECT COUNT(*) INTO actual FROM tasks WHERE user_id = NEW.id AND completed;
        IF NEW.tasks_completed > actual THEN
            NEW.tasks_completed := actual;
        ELSIF NEW.tasks_completed < actual THEN
            FOR doomed IN
                SELECT id FROM tasks WHERE user_id = NEW.id AND completed
                ORDER BY completed_at ASC, id LIMIT actual - NEW.tasks_completed
            LOOP
                SELECT COALESCE(SUM(xp_amount), 0) INTO awarded FROM xp_history WHERE user_id = NEW.id AND source_id = doomed.id;
                IF awarded > 0 THEN
                    INSERT INTO xp_history (user_id, xp_amount, source, source_id) VALUES (NEW.id, -awarded, 'task_delete', doomed.id);
                    removed := removed + awarded;
                END IF;
                DELETE FROM tasks WHERE id = doomed.id;
            END LOOP;
            NEW.xp := GREATEST(0, NEW.xp - removed);
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.xp IS NOT DISTINCT FROM OLD.xp AND NEW.rank IS DISTINCT FROM OLD.rank THEN
        IF NEW.xp < rank_min_xp(NEW.rank) THEN
            NEW.xp := rank_min_xp(NEW.rank);
        ELSIF rank_max_xp(NEW.rank) IS NOT NULL AND NEW.xp > rank_max_xp(NEW.rank) THEN
            NEW.xp := rank_max_xp(NEW.rank);
        END IF;
    END IF;

    NEW.rank := rank_for_xp(NEW.xp);
    NEW.level := NEW.xp / 100;
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_sync_progress BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION users_sync_progress();

-- 9. xp_history is the audit trail: a direct change of users.xp that history does not explain is booked as an adjustment
CREATE FUNCTION users_audit_xp() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    explained INTEGER;
BEGIN
    SELECT COALESCE(SUM(xp_amount), 0) INTO explained FROM xp_history WHERE user_id = NEW.id;
    IF explained <> NEW.xp THEN
        INSERT INTO xp_history (user_id, xp_amount, source) VALUES (NEW.id, NEW.xp - explained, 'admin_adjust');
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER users_audit_xp AFTER UPDATE OF xp ON users
    FOR EACH ROW WHEN (NEW.xp IS DISTINCT FROM OLD.xp) EXECUTE FUNCTION users_audit_xp();
