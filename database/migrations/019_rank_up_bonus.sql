-- Rank-up bonus: a new XP source plus a table that remembers which ranks were already paid (once per user and rank).
ALTER TABLE xp_history DROP CONSTRAINT IF EXISTS xp_history_source_known;
ALTER TABLE xp_history ADD CONSTRAINT xp_history_source_known
    CHECK (source IN ('task', 'task_uncomplete', 'task_delete', 'task_edit', 'admin_adjust', 'daily_goal', 'weekly_trophy', 'rank_up'));

CREATE TABLE IF NOT EXISTS rank_ups (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank VARCHAR(20) NOT NULL,
    xp_amount INTEGER NOT NULL DEFAULT 0,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, rank)
);

-- Ranks reached before this migration count as paid (no retroactive bonus).
-- Thresholds must match backend/services/rankService.js (Newcomer needs no bonus).
INSERT INTO rank_ups (user_id, rank, xp_amount)
SELECT u.id, r.name, 0
FROM users u
JOIN (VALUES ('Bronze', 360), ('Silver', 1080), ('Gold', 2160), ('Platinum', 4320), ('Diamond', 8640), ('Master', 18000)) AS r(name, min_xp)
  ON u.xp >= r.min_xp
ON CONFLICT DO NOTHING;

COMMENT ON TABLE rank_ups IS 'Ranks already paid their rank-up bonus (1% of the rank threshold, max 100 XP), once per user and rank.';
COMMENT ON COLUMN xp_history.source IS 'task, task_uncomplete, task_delete, task_edit, admin_adjust, daily_goal, weekly_trophy, rank_up.';

-- A direct change of users.xp (admin edit on the database page) is booked as admin_adjust by users_audit_xp (migration 011);
-- ranks it skips over count as paid too, so editing XP or rank never pays rank-up bonuses afterwards.
CREATE OR REPLACE FUNCTION users_audit_xp() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    explained INTEGER;
BEGIN
    SELECT COALESCE(SUM(xp_amount), 0) INTO explained FROM xp_history WHERE user_id = NEW.id;
    IF explained <> NEW.xp THEN
        INSERT INTO xp_history (user_id, xp_amount, source) VALUES (NEW.id, NEW.xp - explained, 'admin_adjust');
        INSERT INTO rank_ups (user_id, rank, xp_amount)
        SELECT NEW.id, r, 0 FROM unnest(ARRAY['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master']) AS r
        WHERE rank_min_xp(r) <= NEW.xp
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;
