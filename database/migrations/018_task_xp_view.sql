-- XP earned by tasks, attributed to the moment the task was completed (not to the moment the XP row was booked).
-- Daily goal, weekly ranking, weekly trophy and first-place streaks all read this view, so undoing or editing an
-- old task later never changes the total of another day or week. Rows of tasks that are no longer completed
-- (undone or deleted) are left out: they net to zero anyway.
CREATE OR REPLACE VIEW v_task_xp AS
SELECT h.user_id, h.xp_amount, t.completed_at
FROM xp_history h
JOIN tasks t ON t.id = h.source_id AND t.user_id = h.user_id AND t.completed AND t.completed_at IS NOT NULL
WHERE h.source IN ('task', 'task_uncomplete', 'task_delete', 'task_edit');

COMMENT ON VIEW v_task_xp IS 'Task XP per user, timestamped by tasks.completed_at. Used for the daily goal, weekly ranking, trophy and first-place streaks.';
