-- users_sync_progress: a lowered tasks_completed deletes completed tasks (admin edit on the database page).
-- The app's own count refresh (recalculateMultiplier, which also sets last_multiplier_check) could race with a
-- concurrent completion, look like a lowering and delete tasks. Those refreshes now only correct the counter.
CREATE OR REPLACE FUNCTION users_sync_progress() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    actual INTEGER;
    removed INTEGER := 0;
    awarded INTEGER;
    doomed RECORD;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.tasks_completed IS DISTINCT FROM OLD.tasks_completed THEN
        SELECT COUNT(*) INTO actual FROM tasks WHERE user_id = NEW.id AND completed;
        IF NEW.last_multiplier_check IS DISTINCT FROM OLD.last_multiplier_check THEN
            -- Bookkeeping by the app (recalculateMultiplier refreshes the count together with last_multiplier_check):
            -- only ever heal the counter, never delete tasks. A count taken in a concurrent transaction can be stale,
            -- and treating that as an admin edit deleted completed tasks.
            NEW.tasks_completed := actual;
        ELSIF NEW.tasks_completed > actual THEN
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
