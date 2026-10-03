-- One template per identical task: drop existing duplicates (keep the newest), then enforce it.
DELETE FROM templates t
USING templates newer
WHERE t.user_id = newer.user_id
  AND lower(btrim(t.name)) = lower(btrim(newer.name))
  AND t.duration = newer.duration
  AND t.productivity IS NOT DISTINCT FROM newer.productivity
  AND t.difficulty IS NOT DISTINCT FROM newer.difficulty
  AND t.category IS NOT DISTINCT FROM newer.category
  AND t.bonus IS NOT DISTINCT FROM newer.bonus
  AND (t.created_at, t.id) < (newer.created_at, newer.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_unique
    ON templates (user_id, lower(btrim(name)), duration, COALESCE(productivity, 0), COALESCE(difficulty, 3), COALESCE(category, 'other'), COALESCE(bonus, 0));
