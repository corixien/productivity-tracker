CREATE OR REPLACE FUNCTION recalculate_user_xp_after_task_delete()
RETURNS TRIGGER AS $$
DECLARE
    new_level INTEGER;
    new_rank VARCHAR;
    current_xp INTEGER;
BEGIN
    -- Subtract the deleted task's awarded XP from the user
    SELECT GREATEST(0, users.xp - COALESCE(OLD.xp_awarded, 0))
    INTO current_xp
    FROM users
    WHERE users.id = OLD.user_id;

    UPDATE users SET
        xp = current_xp,
        updated_at = NOW()
    WHERE users.id = OLD.user_id;

    -- Recalculate level and rank from the new XP
    new_level := FLOOR(current_xp / 100)::integer;
    SELECT CASE
        WHEN current_xp >= 5000 THEN 'Master'
        WHEN current_xp >= 2400 THEN 'Diamond'
        WHEN current_xp >= 1200 THEN 'Platinum'
        WHEN current_xp >= 600 THEN 'Gold'
        WHEN current_xp >= 300 THEN 'Silver'
        WHEN current_xp >= 100 THEN 'Bronze'
        ELSE 'Newcomer'
    END INTO new_rank;

    UPDATE users SET
        level = new_level,
        rank = new_rank
    WHERE users.id = OLD.user_id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_delete_recalc_xp
BEFORE DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION recalculate_user_xp_after_task_delete();
